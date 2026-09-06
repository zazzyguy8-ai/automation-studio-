import { resolveIndustry } from './taxonomy';
import { normalizeWebsite } from './overpass';
import type { DiscoveryProvider, DiscoveryQuery, DiscoveryResult, DiscoveredCompany, VerifiedContact } from './types';

/**
 * Discovery via the Google Places API (New).
 *
 * Better coverage than OSM, especially in the US and UK, and it almost always
 * has both a website and a phone number. You pay for it with a card and accept
 * Google's terms - which is why it is opt-in rather than the default.
 *
 * The key comes from GOOGLE_PLACES_API_KEY and is never stored anywhere.
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
    if (!this.apiKey) throw new Error('GOOGLE_PLACES_API_KEY is not set');

    const category = resolveIndustry(query.industry);
    const limit = Math.min(query.limit ?? 25, 20); // Places returns at most 20 per page.
    const where = query.city ? `${query.city}, ${query.country}` : query.country;
    const textQuery = `${category?.label ?? query.industry} in ${where}`;

    const res = await this.fetchImpl(PLACES_SEARCH, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Goog-Api-Key': this.apiKey,
        // The field mask keeps the cost down - you pay per returned field.
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
      throw new Error(`Google Places returned HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
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
        skipped.push({ name, reason: 'no website in Places - without one there is nothing to audit' });
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
      // Places deliberately returns no emails, so none is invented here.

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
        match_reason: `Google Places "${place.primaryType ?? category?.places[0] ?? query.industry}" in ${where}`,
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
