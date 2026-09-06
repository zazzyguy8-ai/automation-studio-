import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Fetcher } from '@/lib/scrape/crawl';
import { fixtureFetcher } from '@/lib/scrape/fixture-fetcher';

/**
 * Offline stand-in for Nominatim / Overpass / Places.
 *
 * Tests and `--offline` runs go through the same code as production - only the
 * transport changes. That way response parsing is genuinely tested, not bypassed.
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

/** Websites of the fictional companies the discovery fixtures return. */
const SITES: Record<string, string> = {
  'northgate-auto.example': 'northgate-auto',
  'www.northgate-auto.example': 'northgate-auto',
};

/** Known domain -> bundled site; everything else is unreachable, as in reality. */
export function fixtureSiteFetcher(): Fetcher {
  return async (url: string) => {
    const host = new URL(url).hostname;
    const dir = SITES[host];
    if (!dir) return { status: 0, html: '' };
    return fixtureFetcher(dir, `https://${host}`)(url);
  };
}
