import { resolveIndustry } from './taxonomy';
import type { DiscoveryProvider, DiscoveryQuery, DiscoveryResult, DiscoveredCompany, VerifiedContact } from './types';

/**
 * Discovery via OpenStreetMap (Nominatim for the area, Overpass for companies).
 *
 * Why this is the default: worldwide coverage, no API key or card, and every
 * record has a public URL you can open and check. That is exactly what the
 * "no claim without a source" rule needs.
 *
 * The limitation to know: OSM is community data. Coverage is excellent in DACH
 * and the Nordics, good in the UK, uneven in the US (where Google Places earns
 * its cost). A company missing from OSM does not mean it does not exist.
 */

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OVERPASS = process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter';

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags?: Record<string, string>;
}

export interface OverpassOptions {
  /** Injectable transport - tests and offline runs. */
  fetch?: typeof fetch;
  userAgent?: string;
}

/** OSM requires an identifiable client; anonymous calls are blocked. */
function agent(opts: OverpassOptions): string {
  return opts.userAgent
    ?? process.env.CRAWL_USER_AGENT
    ?? 'AutomationStudio/0.1 (lead research)';
}

export class OverpassProvider implements DiscoveryProvider {
  readonly name = 'overpass';
  private fetchImpl: typeof fetch;
  private opts: OverpassOptions;

  constructor(opts: OverpassOptions = {}) {
    this.opts = opts;
    this.fetchImpl = opts.fetch ?? fetch;
  }

  available(): boolean {
    return true;
  }

  /** City/country -> an OSM area id Overpass can use. */
  private async resolveArea(query: DiscoveryQuery): Promise<{ areaId: number; label: string }> {
    const q = query.city ? `${query.city}, ${query.country}` : query.country;
    const url = `${NOMINATIM}?q=${encodeURIComponent(q)}&format=json&limit=1&addressdetails=0`;
    const res = await this.fetchImpl(url, {
      headers: { 'user-agent': agent(this.opts), accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Nominatim returned HTTP ${res.status} for "${q}"`);

    const rows = (await res.json()) as Array<{ osm_id: number; osm_type: string; display_name: string }>;
    if (rows.length === 0) throw new Error(`Could not resolve the area "${q}"`);

    const hit = rows[0];
    // Overpass area id: relation + 3600000000, way + 2400000000.
    const offset = hit.osm_type === 'relation' ? 3_600_000_000 : 2_400_000_000;
    if (hit.osm_type === 'node') {
      throw new Error(`"${q}" maps to a point, not an area - try a larger city or region`);
    }
    return { areaId: hit.osm_id + offset, label: hit.display_name };
  }

  private buildQuery(osmTags: string[], areaId: number, limit: number): string {
    const clauses = osmTags
      .map((tag) => {
        const [k, v] = tag.split('=');
        return ['node', 'way'].map((t) => `  ${t}["${k}"="${v}"](area.searchArea);`).join('\n');
      })
      .join('\n');
    return `[out:json][timeout:60];
area(${areaId})->.searchArea;
(
${clauses}
);
out tags center ${limit};`;
  }

  async search(query: DiscoveryQuery): Promise<DiscoveryResult> {
    const category = resolveIndustry(query.industry);
    if (!category) {
      throw new Error(
        `Unknown industry "${query.industry}". Use one of: `
        + `${INDUSTRY_HINT}`,
      );
    }

    const limit = query.limit ?? 25;
    const area = await this.resolveArea(query);
    const raw = this.buildQuery(category.osm, area.areaId, limit * 3);

    const res = await this.fetchImpl(OVERPASS, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': agent(this.opts) },
      body: `data=${encodeURIComponent(raw)}`,
    });
    if (!res.ok) throw new Error(`Overpass returned HTTP ${res.status}`);

    const body = (await res.json()) as { elements?: OverpassElement[] };
    const fetched_at = new Date().toISOString();
    const companies: DiscoveredCompany[] = [];
    const skipped: DiscoveryResult['skipped'] = [];

    for (const el of body.elements ?? []) {
      const tags = el.tags ?? {};
      const name = tags.name?.trim();
      if (!name) continue;

      const website = normalizeWebsite(tags.website ?? tags['contact:website'] ?? tags.url);
      if (query.requireWebsite !== false && !website) {
        skipped.push({ name, reason: 'no website in OSM - without one there is nothing to audit' });
        continue;
      }

      const source_url = `https://www.openstreetmap.org/${el.type}/${el.id}`;
      const contacts: VerifiedContact[] = [];

      // Directory contacts are `from_directory` until checked against the site.
      const phone = tags.phone ?? tags['contact:phone'];
      if (phone) {
        contacts.push({
          kind: 'phone', value: phone, verification: 'from_directory',
          evidence_url: source_url, checked_at: fetched_at,
        });
      }
      const email = tags.email ?? tags['contact:email'];
      if (email) {
        contacts.push({
          kind: 'email', value: email.toLowerCase(), verification: 'from_directory',
          evidence_url: source_url, checked_at: fetched_at,
        });
      }

      const matchedTag = category.osm.find((t) => {
        const [k, v] = t.split('=');
        return tags[k] === v;
      }) ?? null;

      companies.push({
        name,
        website,
        address: [tags['addr:street'], tags['addr:housenumber'], tags['addr:postcode'], tags['addr:city']]
          .filter(Boolean).join(' ') || null,
        city: tags['addr:city'] ?? query.city ?? null,
        country: query.country.toUpperCase(),
        category: matchedTag,
        contacts,
        sources: [{
          provider: this.name,
          source_url,
          source_id: `${el.type}/${el.id}`,
          fields: ['name', ...(website ? ['website'] : []), ...(phone ? ['phone'] : []), ...(email ? ['email'] : [])],
          fetched_at,
        }],
        match_reason: `OSM ${matchedTag ?? 'tag'} within ${area.label}`,
      });

      if (companies.length >= limit) break;
    }

    return {
      companies,
      query_echo: { provider: this.name, industry: category.key, resolved_area: area.label, raw_query: raw },
      skipped,
    };
  }
}

const INDUSTRY_HINT = 'car repair, dental clinic, clinic, estate agency, construction, law firm, '
  + 'accounting, salon, fitness, veterinary, hotel/restaurant, agency';

/** Directories list websites inconsistently; normalise, change nothing else. */
export function normalizeWebsite(raw: string | undefined): string | null {
  if (!raw) return null;
  const first = raw.split(/[;,\s]+/)[0]?.trim();
  if (!first) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(first) ? first : `https://${first}`);
    if (!url.hostname.includes('.')) return null;
    // A social profile is not a company website - the audit would have nothing to read.
    if (/facebook\.com|instagram\.com|linkedin\.com|twitter\.com|x\.com/i.test(url.hostname)) return null;
    return `${url.origin}${url.pathname === '/' ? '' : url.pathname}`;
  } catch {
    return null;
  }
}
