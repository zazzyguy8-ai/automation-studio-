import { z } from 'zod';
import { PLATFORMS, PLATFORM_SPECS, fitTitle, type Platform } from './platforms';

/**
 * What one photo turns into.
 *
 * The shape carries one rule throughout: anything the camera cannot show is
 * either null or asked of the seller. A model that invents "UK 10" because the
 * shoe looks big produces a listing that gets returned, and a return is worse
 * for the seller than a slower sale. So size, measurements and purchase date
 * are allowed to be unknown, and `ask_the_seller` exists to collect them.
 */

export const CONDITIONS = [
  'new_with_tags', 'new_without_tags', 'excellent', 'good', 'fair', 'for_parts',
] as const;

export const CONDITION_LABELS: Record<(typeof CONDITIONS)[number], string> = {
  new_with_tags: 'New with tags',
  new_without_tags: 'New without tags',
  excellent: 'Excellent — barely used',
  good: 'Good — visible wear',
  fair: 'Fair — clear flaws',
  for_parts: 'For parts or repair',
};

export const ItemSchema = z.object({
  what: z.string().min(2),
  brand: z.string().nullable(),
  /** How the brand was arrived at. `guessed` is never printed as a fact. */
  brand_confidence: z.enum(['visible', 'likely', 'unknown']),
  model: z.string().nullable(),
  colour: z.string(),
  material: z.string().nullable(),
  size_on_label: z.string().nullable(),
  condition: z.enum(CONDITIONS),
  condition_evidence: z.array(z.string()).min(1).max(5),
  flaws: z.array(z.string()).max(6),
  features: z.array(z.string()).max(8),
  era_or_style: z.string().nullable(),
});

export const PriceSchema = z.object({
  currency: z.string().length(3),
  low: z.number().nonnegative(),
  suggested: z.number().nonnegative(),
  high: z.number().nonnegative(),
  /** Why this range, in the seller's terms. Shown, never hidden behind a number. */
  basis: z.string().min(10),
  confidence: z.enum(['low', 'medium', 'high']),
});

export const PlatformCopySchema = z.object({
  platform: z.enum(PLATFORMS),
  title: z.string().min(3),
  hashtags: z.array(z.string()).max(13),
});

export const ListingSchema = z.object({
  item: ItemSchema,
  title: z.string().min(3),
  description: z.string().min(40),
  bullets: z.array(z.string()).min(2).max(6),
  keywords: z.array(z.string()).min(3).max(15),
  platforms: z.array(PlatformCopySchema).min(1),
  price: PriceSchema,
  ask_the_seller: z.array(z.string()).max(5),
  photo_tips: z.array(z.string()).max(3),
});

export type Item = z.infer<typeof ItemSchema>;
export type Price = z.infer<typeof PriceSchema>;
export type Listing = z.infer<typeof ListingSchema>;

/**
 * The copy a seller actually pastes, with every platform limit enforced here
 * rather than trusted to the model.
 *
 * Hashtags are dropped entirely on platforms where they read as spam, which is
 * most of them - the model is asked for them anyway because it is cheaper to
 * discard them than to run a second call when the seller switches to Depop.
 */
export function renderFor(listing: Listing, platform: Platform): {
  title: string;
  description: string;
  hashtags: string[];
  overflow: boolean;
} {
  const spec = PLATFORM_SPECS[platform];
  const copy = listing.platforms.find((p) => p.platform === platform);
  const rawTitle = copy?.title ?? listing.title;

  const tags = spec.hashtags === 0
    ? []
    : (copy?.hashtags ?? []).slice(0, spec.hashtags).map((t) => (t.startsWith('#') ? t : `#${t}`));

  const body = [
    listing.description.trim(),
    listing.bullets.length ? listing.bullets.map((b) => `• ${b}`).join('\n') : '',
    tags.join(' '),
  ].filter(Boolean).join('\n\n');

  return {
    title: fitTitle(rawTitle, spec.titleMax),
    description: body.length <= spec.descriptionMax ? body : `${body.slice(0, spec.descriptionMax - 1).trimEnd()}…`,
    hashtags: tags,
    overflow: rawTitle.trim().length > spec.titleMax,
  };
}
