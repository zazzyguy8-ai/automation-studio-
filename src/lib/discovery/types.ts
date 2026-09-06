import { z } from 'zod';

/** Odkaz na zdroj. Každé tvrdenie o firme musí niesť takýto odkaz -
 *  bez neho sa údaj do CRM nedostane. */
export const SourceRefSchema = z.object({
  /** Ktorý provider to našiel: 'overpass', 'google_places', 'import', 'website'. */
  provider: z.string(),
  /** Verejne overiteľná URL, kde sa dá záznam skontrolovať. */
  source_url: z.string(),
  /** Identifikátor v zdroji (napr. OSM node/12345, Places place_id). */
  source_id: z.string().nullable(),
  /** Ktoré polia pochádzajú práve z tohto zdroja. */
  fields: z.array(z.string()),
  fetched_at: z.string(),
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

/**
 * Ako bol kontakt overený.
 *
 *  found_on_site  - našli sme ho na vlastnom webe firmy (najsilnejší dôkaz)
 *  from_directory - uvedený v adresári (OSM/Places), na webe zatiaľ nepotvrdený
 *  unverified     - nepotvrdený; nikdy sa nepoužije v outreachi
 *
 * Kontakt sa NIKDY neodvodzuje (žiadne "asi info@domena.sk"). Buď je
 * niekde napísaný, alebo neexistuje.
 */
export const ContactVerificationSchema = z.enum(['found_on_site', 'from_directory', 'unverified']);
export type ContactVerification = z.infer<typeof ContactVerificationSchema>;

export const VerifiedContactSchema = z.object({
  kind: z.enum(['email', 'phone', 'form', 'whatsapp', 'other']),
  value: z.string(),
  verification: ContactVerificationSchema,
  /** URL, na ktorej kontakt reálne stojí. */
  evidence_url: z.string().nullable(),
  checked_at: z.string(),
});
export type VerifiedContact = z.infer<typeof VerifiedContactSchema>;

export const DiscoveredCompanySchema = z.object({
  name: z.string(),
  website: z.string().nullable(),
  /** Presne ako to uvádza zdroj - neprekladáme ani neupravujeme. */
  address: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  /** Kategória zo zdroja (OSM tag, Places type), nie náš odhad. */
  category: z.string().nullable(),
  contacts: z.array(VerifiedContactSchema),
  sources: z.array(SourceRefSchema).min(1),
  /** Prečo si myslíme, že je to relevantné pre zadaný dopyt. */
  match_reason: z.string(),
});
export type DiscoveredCompany = z.infer<typeof DiscoveredCompanySchema>;

export interface DiscoveryQuery {
  /** Voľný text, napr. "autoservis", "dental clinic", "roofing contractor". */
  industry: string;
  /** ISO kód krajiny, napr. GB, US, DE, SE. */
  country: string;
  /** Nepovinné mesto; bez neho hľadáme v rámci krajiny. */
  city?: string | null;
  limit?: number;
  /** Preskočiť firmy bez webu - bez webu nevieme urobiť audit. */
  requireWebsite?: boolean;
}

export interface DiscoveryResult {
  companies: DiscoveredCompany[];
  /** Čo sa reálne pýtalo, aby sa dal výsledok zreprodukovať. */
  query_echo: {
    provider: string;
    industry: string;
    resolved_area: string;
    raw_query: string;
  };
  /** Dôvody, prečo bol niektorý záznam zahodený - viditeľné, nie tiché. */
  skipped: Array<{ name: string; reason: string }>;
}

export interface DiscoveryProvider {
  readonly name: string;
  /** Či je provider použiteľný (napr. má kľúč). */
  available(): boolean;
  search(query: DiscoveryQuery): Promise<DiscoveryResult>;
}
