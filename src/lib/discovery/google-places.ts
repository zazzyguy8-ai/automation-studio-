import { resolveIndustry } from './taxonomy';
import { normalizeWebsite } from './overpass';
import type { DiscoveryProvider, DiscoveryQuery, DiscoveryResult, DiscoveredCompany, VerifiedContact } from './types';

/**
 * Discovery cez Google Places API (New).
 *
 * Lepšie pokrytie než OSM, hlavne v USA a UK, a takmer vždy má web aj telefón.
 * Za to platíš kartou a viažeš sa na podmienky Google - preto to nie je default,
 * ale voľba, keď OSM v danej oblasti nestačí.
 *
 * Kľúč sa berie z GOOGLE_PLACES_API_KEY a nikdy sa nikam neukladá.
 */

const PLACES_SEARCH = 'https://places.googleapis.com/v1/places:searchText';

interface PlacesPlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  primaryType?: string;
  addressComponents?: Array<{ longText?: string; types?: string[] }>;
}

export interface PlacesOptions {
  apiKey?: string;
  fetch?: typeof fetch;
}

export class GooglePlacesProvider implements DiscoveryProvider {
  readonly name = 'google_places';
  private apiKey: string | undefined;
  private fetchImpl: typeof fetch;

  constructor(opts: PlacesOptions = {}) {
    this.apiKey = opts.apiKey ?? process.env.GOOGLE_PLACES_API_KEY;
    this.fetchImpl = opts.fetch ?? fetch;
  }

  available(): boolean {
    return Boolean(this.apiKey);
  }

  async search(query: DiscoveryQuery): Promise<DiscoveryResult> {
    if (!this.apiKey) throw new Error('GOOGLE_PLACES_API_KEY nie je nastavený');

    const category = resolveIndustry(query.industry);
    const limit = Math.min(query.limit ?? 25, 20); // Places vracia max 20 na stránku.
    const where = query.city ? `${query.city}, ${query.country}` : query.country;
    const textQuery = `${category?.label ?? query.industry} in ${where}`;

    const res = await this.fetchImpl(PLACES_SEARCH, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Goog-Api-Key': this.apiKey,
        // Field mask drží cenu dole - platí sa za vrátené polia.
        'X-Goog-FieldMask': [
          'places.id', 'places.displayName', 'places.formattedAddress', 'places.websiteUri',
          'places.nationalPhoneNumber', 'places.internationalPhoneNumber', 'places.primaryType',
          'places.addressComponents',
        ].join(','),
      },
      body: JSON.stringify({
        textQuery,
        maxResultCount: limit,
        ...(category?.places.length ? { includedType: category.places[0] } : {}),
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Google Places vrátil HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
    }

    const body = (await res.json()) as { places?: PlacesPlace[] };
    const fetched_at = new Date().toISOString();
    const companies: DiscoveredCompany[] = [];
    const skipped: DiscoveryResult['skipped'] = [];

    for (const place of body.places ?? []) {
      const name = place.displayName?.text?.trim();
      if (!name) continue;

      const website = normalizeWebsite(place.websiteUri);
      if (query.requireWebsite !== false && !website) {
        skipped.push({ name, reason: 'Places nemá web - bez webu sa nedá urobiť audit' });
        continue;
      }

      const source_url = place.id
        ? `https://www.google.com/maps/place/?q=place_id:${place.id}`
        : 'https://places.googleapis.com';
      const contacts: VerifiedContact[] = [];
      const phone = place.internationalPhoneNumber ?? place.nationalPhoneNumber;
      if (phone) {
        contacts.push({
          kind: 'phone', value: phone, verification: 'from_directory',
          evidence_url: source_url, checked_at: fetched_at,
        });
      }
      // Places zámerne nevracia emaily, takže tu žiadny nevzniká.

      const cityComponent = place.addressComponents
        ?.find((c) => c.types?.includes('locality') || c.types?.includes('postal_town'))?.longText;

      companies.push({
        name,
        website,
        address: place.formattedAddress ?? null,
        city: cityComponent ?? query.city ?? null,
        country: query.country.toUpperCase(),
        category: place.primaryType ?? null,
        contacts,
        sources: [{
          provider: this.name,
          source_url,
          source_id: place.id ?? null,
          fields: ['name', 'address', ...(website ? ['website'] : []), ...(phone ? ['phone'] : [])],
          fetched_at,
        }],
        match_reason: `Google Places "${place.primaryType ?? category?.places[0] ?? query.industry}" v ${where}`,
      });
    }

    return {
      companies,
      query_echo: {
        provider: this.name,
        industry: category?.key ?? query.industry,
        resolved_area: where,
        raw_query: textQuery,
      },
      skipped,
    };
  }
}
