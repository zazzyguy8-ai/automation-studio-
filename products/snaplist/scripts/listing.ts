/**
 * One listing from the command line, for checking prompt changes against a
 * real photo without clicking through the app.
 *
 *   npm run listing -- ./jacket.jpg --platform ebay --currency GBP
 */
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { generateListing, type Photo } from '../src/lib/listing/generate';
import { isPlatform, type Platform } from '../src/lib/listing/platforms';
import { renderFor } from '../src/lib/listing/schema';

const MEDIA_TYPES: Record<string, Photo['media_type']> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif',
};

function flag(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] ?? fallback : fallback;
}

async function main(): Promise<void> {
  const paths = process.argv.slice(2).filter((a) => !a.startsWith('--') && MEDIA_TYPES[extname(a).toLowerCase()]);
  if (paths.length === 0) {
    console.error('Usage: npm run listing -- ./photo.jpg [--platform ebay] [--currency USD] [--notes "..."]');
    process.exit(1);
  }

  const platform = flag('platform', 'ebay');
  if (!isPlatform(platform)) {
    console.error(`Unknown platform "${platform}".`);
    process.exit(1);
  }

  const photos: Photo[] = await Promise.all(paths.map(async (path) => ({
    media_type: MEDIA_TYPES[extname(path).toLowerCase()],
    data: (await readFile(path)).toString('base64'),
  })));

  const listing = await generateListing({
    photos,
    platforms: [platform as Platform],
    currency: flag('currency', 'USD').toUpperCase(),
    notes: flag('notes', '') || null,
  });

  const copy = renderFor(listing, platform);
  console.log(`\n── ${platform} ─────────────────────────────`);
  console.log(`TITLE (${copy.title.length}) ${copy.title}\n`);
  console.log(copy.description);
  console.log(`\nPRICE ${listing.price.currency} ${listing.price.low}–${listing.price.high}, list at ${listing.price.suggested} (${listing.price.confidence})`);
  console.log(`BASIS ${listing.price.basis}`);
  if (listing.ask_the_seller.length) console.log(`\nASK: ${listing.ask_the_seller.join(' | ')}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
