import { getStore } from '@/lib/db';
import type { Fetcher } from '@/lib/scrape/crawl';
import type { Contact, Lead } from '@/lib/types';
import { GooglePlacesProvider } from './google-places';
import { getMarket, type Market } from './markets';
import { OverpassProvider } from './overpass';
import { resolveIndustry, industryOptions } from './taxonomy';
import type { DiscoveryProvider, DiscoveryQuery, DiscoveryResult } from './types';
import { readyForAudit, verifyCompany, type VerifiedCompany } from './verify';

export interface DiscoveryOptions {
  /** 'auto' uprednostní Places, keď je kľúč, inak OSM. */
  provider?: 'auto' | 'overpass' | 'google_places';
  /** Injektovateľné transporty pre testy a offline beh. */
  searchFetch?: typeof fetch;
  siteFetcher?: Fetcher;
  /** Overiť weby nájdených firiem (pomalšie, ale bez toho nemáš dôkazy). */
  verify?: boolean;
}

export interface DiscoveredLead {
  company: VerifiedCompany;
  market: Market;
  /** Uložený lead, keď firma prešla až do CRM. */
  lead: Lead | null;
  ready_for_audit: boolean;
  /** Prečo sa firma neuložila, ak sa neuložila. */
  rejected_reason: string | null;
}

export interface DiscoveryRun {
  query: DiscoveryQuery;
  market: Market;
  provider: string;
  resolved_area: string;
  raw_query: string;
  results: DiscoveredLead[];
  skipped: DiscoveryResult['skipped'];
  summary: {
    found: number;
    verified: number;
    ready_for_audit: number;
    saved: number;
  };
}

export function pickProvider(opts: DiscoveryOptions = {}): DiscoveryProvider {
  const places = new GooglePlacesProvider({ fetch: opts.searchFetch });
  const overpass = new OverpassProvider({ fetch: opts.searchFetch });

  if (opts.provider === 'google_places') return places;
  if (opts.provider === 'overpass') return overpass;
  return places.available() ? places : overpass;
}

/**
 * Odvetvie + krajina/mesto -> overené firmy -> leady v CRM.
 *
 * Nič sa neodosiela. Discovery iba plní pipeline v stave `new`; audit, demo a
 * outreach sú samostatné kroky, ktoré spúšťaš vedome.
 */
export async function runDiscovery(
  query: DiscoveryQuery,
  opts: DiscoveryOptions = {},
): Promise<DiscoveryRun> {
  if (!resolveIndustry(query.industry)) {
    throw new Error(
      `Odvetvie "${query.industry}" nepoznám. Podporované: `
      + industryOptions().map((i) => i.label).join(', '),
    );
  }
  if (!query.country || query.country.trim().length < 2) {
    throw new Error('Krajina je povinná (ISO kód, napr. GB, US, DE, SE)');
  }

  const provider = pickProvider(opts);
  const market = getMarket(query.country);
  const found = await provider.search(query);
  const store = await getStore();

  const results: DiscoveredLead[] = [];

  for (const company of found.companies) {
    const verified: VerifiedCompany = opts.verify === false
      ? {
          ...company,
          verification: {
            website_reachable: false, website_error: 'overenie preskočené',
            pages_read: 0, name_matches_site: false, checked_at: new Date().toISOString(),
          },
        }
      : await verifyCompany(company, { fetcher: opts.siteFetcher });

    const ready = readyForAudit(verified);

    if (!verified.website) {
      results.push({
        company: verified, market, lead: null, ready_for_audit: false,
        rejected_reason: 'bez webu sa nedá urobiť audit',
      });
      continue;
    }
    if (opts.verify !== false && !ready) {
      results.push({
        company: verified, market, lead: null, ready_for_audit: false,
        rejected_reason: `web nedostupný: ${verified.verification.website_error}`,
      });
      continue;
    }

    // Do CRM idú len kontakty s dôkazom. Neoverené sa zahadzujú, nie ukladajú.
    const contacts: Contact[] = verified.contacts
      .filter((c) => c.verification !== 'unverified')
      .map((c) => ({
        kind: c.kind,
        value: c.value,
        source_url: c.evidence_url ?? undefined,
        label: c.verification,
      }));

    const lead = await store.upsertLead({
      company_name: verified.name,
      website: verified.website,
      industry: query.industry,
      country: market.country,
      size_hint: null,
      stage: 'new',
      contacts,
      socials: [],
      notes: [
        `Nájdené cez ${provider.name}: ${verified.match_reason}.`,
        `Zdroje: ${verified.sources.map((s) => s.source_url).join(' | ')}`,
        verified.verification.name_matches_site
          ? 'Názov firmy potvrdený na jej vlastnom webe.'
          : 'POZOR: názov firmy sa na uvedenom webe nepodarilo potvrdiť - over, či web patrí jej.',
        `Trh ${market.name}: outreach riziko ${market.outreach_risk}.`,
      ].join('\n'),
      source: `discovery:${provider.name}`,
    });

    results.push({ company: verified, market, lead, ready_for_audit: ready, rejected_reason: null });
  }

  return {
    query,
    market,
    provider: provider.name,
    resolved_area: found.query_echo.resolved_area,
    raw_query: found.query_echo.raw_query,
    results,
    skipped: found.skipped,
    summary: {
      found: found.companies.length,
      verified: results.filter((r) => r.company.verification.website_reachable).length,
      ready_for_audit: results.filter((r) => r.ready_for_audit).length,
      saved: results.filter((r) => r.lead !== null).length,
    },
  };
}
