import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Fetcher } from '@/lib/scrape/crawl';
import { fixtureFetcher } from '@/lib/scrape/fixture-fetcher';

/**
 * Offline náhrada za Nominatim / Overpass / Places.
 *
 * Testy aj `--offline` beh idú cez rovnaký kód ako produkcia - mení sa iba
 * transport. Vďaka tomu parsovanie odpovedí testujeme naozaj, nie obídeme.
 */
export function fixtureSearchFetch(): typeof fetch {
  const dir = join(process.cwd(), 'fixtures', 'discovery');

  const reply = async (file: string) => new Response(await readFile(join(dir, file), 'utf8'), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

  return (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes('nominatim')) return reply('nominatim-manchester.json');
    if (url.includes('overpass')) return reply('overpass-manchester-auto.json');
    if (url.includes('places.googleapis.com')) return reply('places-manchester-auto.json');
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
}

/** Weby fiktívnych firiem, ktoré discovery fixtures vracajú. */
const SITES: Record<string, string> = {
  'northgate-auto.example': 'northgate-auto',
  'www.northgate-auto.example': 'northgate-auto',
};

/** Známa doména -> bundled web; všetko ostatné je nedostupné, tak ako v realite. */
export function fixtureSiteFetcher(): Fetcher {
  return async (url: string) => {
    const host = new URL(url).hostname;
    const dir = SITES[host];
    if (!dir) return { status: 0, html: '' };
    return fixtureFetcher(dir, `https://${host}`)(url);
  };
}
