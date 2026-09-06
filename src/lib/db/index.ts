import { FileStore } from './file-store';
import type { Store } from './store';

let singleton: Store | null = null;

/** Postgres when DATABASE_URL is set, file-backed store otherwise.
 *  Nothing above this line knows which one it is talking to. */
export async function getStore(): Promise<Store> {
  if (singleton) return singleton;
  if (process.env.DATABASE_URL) {
    const { PgStore } = await import('./pg-store');
    singleton = new PgStore();
  } else {
    singleton = new FileStore();
  }
  await singleton.init();
  return singleton;
}

export type { Store } from './store';
