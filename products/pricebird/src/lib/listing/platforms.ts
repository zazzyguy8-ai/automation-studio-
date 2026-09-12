/**
 * The marketplaces we format for, and the limits that actually bite.
 *
 * These numbers are the reason the product exists. A seller writes one good
 * title, pastes it into eBay, and eBay silently truncates it at 80 characters
 * - usually mid-word, usually cutting the size off the end. Every limit here
 * is enforced in code rather than only asked for in the prompt, because a
 * model that is *told* to stay under 80 characters will occasionally hand back
 * 83 and we would be shipping a broken paste.
 *
 * Where a platform's limit is generous we still cap the title, because a
 * 300-character title reads as spam to a human buyer on every one of them.
 */

export const PLATFORMS = ['ebay', 'vinted', 'depop', 'facebook', 'poshmark', 'mercari', 'etsy'] as const;

export type Platform = (typeof PLATFORMS)[number];

export interface PlatformSpec {
  key: Platform;
  label: string;
  titleMax: number;
  descriptionMax: number;
  /** Hashtags are a Depop/Etsy habit; on eBay they look like spam. */
  hashtags: number;
  /** What buyers on this platform scan for first, fed to the prompt. */
  voice: string;
}

export const PLATFORM_SPECS: Record<Platform, PlatformSpec> = {
  ebay: {
    key: 'ebay', label: 'eBay', titleMax: 80, descriptionMax: 4000, hashtags: 0,
    voice: 'keyword-dense and literal: brand, model, size, colour, condition. Buyers arrive from search, not from browsing.',
  },
  vinted: {
    key: 'vinted', label: 'Vinted', titleMax: 100, descriptionMax: 3000, hashtags: 0,
    voice: 'plain and honest, flaws stated up front. Brand and size matter most; buyers filter by them.',
  },
  depop: {
    key: 'depop', label: 'Depop', titleMax: 65, descriptionMax: 1000, hashtags: 5,
    voice: 'style-led and short. Name the era or aesthetic a buyer would search (y2k, workwear, oversized).',
  },
  facebook: {
    key: 'facebook', label: 'Facebook Marketplace', titleMax: 100, descriptionMax: 5000, hashtags: 0,
    voice: 'local and practical: what it is, condition, whether it works, collection or delivery.',
  },
  poshmark: {
    key: 'poshmark', label: 'Poshmark', titleMax: 80, descriptionMax: 1500, hashtags: 3,
    voice: 'brand-first and flattering but accurate; measurements belong in the description.',
  },
  mercari: {
    key: 'mercari', label: 'Mercari', titleMax: 80, descriptionMax: 1000, hashtags: 0,
    voice: 'direct and factual, condition grade early, shipping weight implied by size.',
  },
  etsy: {
    key: 'etsy', label: 'Etsy', titleMax: 140, descriptionMax: 4000, hashtags: 13,
    voice: 'for vintage and handmade: age, era, maker, materials. Long-tail search phrases, not single words.',
  },
};

export function isPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value);
}

/**
 * Cuts a title to a limit at a word boundary.
 *
 * Never mid-word, and never leaving dangling punctuation: a title ending in
 * "Nike Air Max 90 Wh" looks like a broken listing and costs clicks. If even
 * the first word is too long we hard-cut, because returning nothing is worse.
 */
export function fitTitle(title: string, max: number): string {
  const clean = title.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;

  const cut = clean.slice(0, max + 1);
  const lastSpace = cut.lastIndexOf(' ');
  const trimmed = (lastSpace > 0 ? cut.slice(0, lastSpace) : clean.slice(0, max)).replace(/[\s,;:\-–—/&+]+$/, '');
  return trimmed.length > 0 ? trimmed : clean.slice(0, max);
}
