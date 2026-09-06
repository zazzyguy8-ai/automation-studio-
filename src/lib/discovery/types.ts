import { z } from 'zod';

/** A source reference. Every claim about a company must carry one -
 *  without it the value never reaches the CRM. */
export const SourceRefSchema = z.object({
  /** Which provider found it: 'overpass', 'google_places', 'import', 'website'. */
  provider: z.string(),
  /** Publicly checkable URL where the record can be verified. */
  source_url: z.string(),
  /** Identifier within the source (e.g. OSM node/12345, Places place_id). */
  source_id: z.string().nullable(),
  /** Which fields came from this particular source. */
  fields: z.array(z.string()),
  fetched_at: z.string(),
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

/**
 * How a contact was verified.
 *
 *  found_on_site  - read from the company's own website (strongest evidence)
 *  from_directory - listed in a directory (OSM/Places), unconfirmed on the site
 *  unverified     - unconfirmed; never used in outreach
 *
 * A contact is NEVER derived (no "presumably info@domain.com"). Either it is
 * written down somewhere, or it does not exist.
 */
export const ContactVerificationSchema = z.enum(['found_on_site', 'from_directory', 'unverified']);
export type ContactVerification = z.infer<typeof ContactVerificationSchema>;

export const VerifiedContactSchema = z.object({
  kind: z.enum(['email', 'phone', 'form', 'whatsapp', 'other']),
  value: z.string(),
  verification: ContactVerificationSchema,
  /** URL where the contact actually appears. */
  evidence_url: z.string().nullable(),
  checked_at: z.string(),
});
export type VerifiedContact = z.infer<typeof VerifiedContactSchema>;

export const DiscoveredCompanySchema = z.object({
  name: z.string(),
  website: z.string().nullable(),
  /** Exactly as the source states it - not translated or reformatted. */
  address: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  /** Category from the source (OSM tag, Places type), not our guess. */
  category: z.string().nullable(),
  contacts: z.array(VerifiedContactSchema),
  sources: z.array(SourceRefSchema).min(1),
  /** Why we believe this matches the query. */
  match_reason: z.string(),
});
export type DiscoveredCompany = z.infer<typeof DiscoveredCompanySchema>;

export interface DiscoveryQuery {
  /** Free text, e.g. "autoservis", "dental clinic", "roofing contractor". */
  industry: string;
  /** ISO country code, e.g. GB, US, DE, SE. */
  country: string;
  /** Optional city; without it we search the whole country. */
  city?: string | null;
  limit?: number;
  /** Skip companies with no website - without one we cannot audit them. */
  requireWebsite?: boolean;
}

export interface DiscoveryResult {
  companies: DiscoveredCompany[];
  /** What was actually asked, so the result can be reproduced. */
  query_echo: {
    provider: string;
    industry: string;
    resolved_area: string;
    raw_query: string;
  };
  /** Why a record was dropped - visible, not silent. */
  skipped: Array<{ name: string; reason: string }>;
}

export interface DiscoveryProvider {
  readonly name: string;
  /** Whether the provider is usable (e.g. has a key). */
  available(): boolean;
  search(query: DiscoveryQuery): Promise<DiscoveryResult>;
}
