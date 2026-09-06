import { crawlSite, CrawlError, type Fetcher } from '@/lib/scrape/crawl';
import type { DiscoveredCompany, VerifiedContact } from './types';

/**
 * Verifies a company against its own website.
 *
 * The rule here holds without exception: a contact is NEVER derived. No
 * "it is probably info@domain.com", no assembling first and last names. A
 * contact is valid only if it is actually written somewhere, and it carries
 * the URL where it appears.
 *
 * A directory contact (OSM/Places) is promoted to `found_on_site` only if we
 * also find it on the company's site. If not, it stays `from_directory` -
 * usable, but weaker evidence, and the UI says so out loud.
 */

export interface VerifiedCompany extends DiscoveredCompany {
  verification: {
    website_reachable: boolean;
    /** Why not, when it is not. */
    website_error: string | null;
    pages_read: number;
    /** The name appears on the site - evidence the site really is theirs. */
    name_matches_site: boolean;
    checked_at: string;
  };
}

/** Loose name comparison: "Karoseria Hronec s.r.o." vs "Karoseria Hronec". */
function nameAppearsOnSite(name: string, corpus: string): boolean {
  const strip = (s: string) => s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\b(s\.?r\.?o|a\.?s|ltd|limited|plc|gmbh|ag|ab|as|oy|aps|inc|llc|bv|kft|spol)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  const needle = strip(name);
  const hay = strip(corpus);
  if (needle.length < 3) return false;
  if (hay.includes(needle)) return true;

  // At least two distinctive words - word order differs between sources.
  const words = needle.split(' ').filter((w) => w.length >= 4);
  const hits = words.filter((w) => hay.includes(w)).length;
  return words.length >= 2 ? hits >= 2 : hits >= 1;
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Compares digits only, because formatting differs between sources. */
const digitsOf = (s: string) => s.replace(/\D/g, '');

export interface VerifyOptions {
  fetcher?: Fetcher;
  maxPages?: number;
}

/**
 * Reads the company's public site and promotes or adds the contacts that
 * genuinely appear on it. An unreachable site is not a reason to discard the
 * company - it is recorded honestly and the audit simply does not run.
 */
export async function verifyCompany(
  company: DiscoveredCompany,
  opts: VerifyOptions = {},
): Promise<VerifiedCompany> {
  const checked_at = new Date().toISOString();

  if (!company.website) {
    return {
      ...company,
      verification: {
        website_reachable: false,
        website_error: 'the source lists no website',
        pages_read: 0,
        name_matches_site: false,
        checked_at,
      },
    };
  }

  let snapshot;
  try {
    snapshot = await crawlSite(company.website, { fetcher: opts.fetcher, maxPages: opts.maxPages ?? 5 });
  } catch (err) {
    return {
      ...company,
      verification: {
        website_reachable: false,
        website_error: err instanceof CrawlError
          ? `${err.message} (HTTP ${err.status})`
          : err instanceof Error ? err.message : String(err),
        pages_read: 0,
        name_matches_site: false,
        checked_at,
      },
    };
  }

  const corpus = snapshot.pages.map((p) => p.text).join('\n');
  const pageFor = (needle: string): string =>
    snapshot.pages.find((p) => p.text.includes(needle))?.url ?? snapshot.pages[0].url;

  const contacts: VerifiedContact[] = [];
  const seen = new Set<string>();

  const add = (c: VerifiedContact) => {
    const key = `${c.kind}:${c.value.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    contacts.push(c);
  };

  // 1) Emails actually written on the site.
  for (const match of corpus.matchAll(EMAIL_RE)) {
    const email = match[0].toLowerCase();
    if (/\.(png|jpe?g|gif|webp|svg)$/.test(email)) continue;
    add({
      kind: 'email', value: email, verification: 'found_on_site',
      evidence_url: pageFor(match[0]), checked_at,
    });
  }

  // 2) Phone numbers from the signals (detected mechanically from the HTML).
  for (const phone of snapshot.signals.phone_numbers) {
    add({
      kind: 'phone', value: phone, verification: 'found_on_site',
      evidence_url: pageFor(phone), checked_at,
    });
  }

  if (snapshot.signals.has_contact_form) {
    add({
      kind: 'form', value: 'contact form on the website', verification: 'found_on_site',
      evidence_url: snapshot.pages[0].url, checked_at,
    });
  }

  // 3) Directory contacts: promote if they match the site, else keep weaker.
  const siteDigits = new Set(snapshot.signals.phone_numbers.map(digitsOf));
  for (const original of company.contacts) {
    if (original.kind === 'phone') {
      const d = digitsOf(original.value);
      const onSite = [...siteDigits].some((s) => s.endsWith(d.slice(-9)) || d.endsWith(s.slice(-9)));
      add({
        ...original,
        verification: onSite ? 'found_on_site' : 'from_directory',
        evidence_url: onSite ? pageFor(snapshot.signals.phone_numbers[0] ?? '') : original.evidence_url,
        checked_at,
      });
      continue;
    }
    if (original.kind === 'email') {
      const onSite = corpus.toLowerCase().includes(original.value.toLowerCase());
      add({
        ...original,
        verification: onSite ? 'found_on_site' : 'from_directory',
        evidence_url: onSite ? pageFor(original.value) : original.evidence_url,
        checked_at,
      });
      continue;
    }
    add({ ...original, checked_at });
  }

  const name_matches_site = nameAppearsOnSite(company.name, `${corpus} ${snapshot.pages.map((p) => p.title).join(' ')}`);

  return {
    ...company,
    contacts,
    sources: [
      ...company.sources,
      {
        provider: 'website',
        source_url: snapshot.root_url,
        source_id: null,
        fields: ['contacts', 'name_match'],
        fetched_at: checked_at,
      },
    ],
    verification: {
      website_reachable: true,
      website_error: null,
      pages_read: snapshot.pages.length,
      name_matches_site,
      checked_at,
    },
  };
}

/** A company is auditable once its site is reachable. Without it there is nothing to read. */
export function readyForAudit(company: VerifiedCompany): boolean {
  return company.verification.website_reachable && company.verification.pages_read > 0;
}

/** A contact allowed into outreach: only one that actually appears somewhere. */
export function contactableBy(company: VerifiedCompany, kind: 'email' | 'phone' | 'form'): VerifiedContact | null {
  const candidates = company.contacts.filter((c) => c.kind === kind && c.verification !== 'unverified');
  return candidates.find((c) => c.verification === 'found_on_site') ?? candidates[0] ?? null;
}
