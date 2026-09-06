import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Fetcher } from './crawl';

/** Serves fixtures/sites/<dir>/ over the same interface as the network
 *  fetcher, so the pipeline under test is byte-for-byte the production one. */
export function fixtureFetcher(dir: string, rootUrl: string): Fetcher {
  const root = new URL(rootUrl);
  const base = join(process.cwd(), 'fixtures', 'sites', dir);

  return async (url: string) => {
    const path = new URL(url).pathname.replace(/^\//, '').replace(/\/$/, '');
    const file = path === '' ? 'index.html' : `${path}.html`;
    if (new URL(url).hostname !== root.hostname) return { status: 0, html: '' };
    try {
      return { status: 200, html: await readFile(join(base, file), 'utf8') };
    } catch {
      return { status: 404, html: '' };
    }
  };
}
