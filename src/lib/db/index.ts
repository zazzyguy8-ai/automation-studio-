import { DEFAULT_ACCOUNT_ID, FileStore } from './file-store';
import type { Store } from './store';

/**
 * One store per account, cached.
 *
 * The account is a constructor argument rather than a parameter on each query,
 * so the boundary holds without any call site having to remember it. Asking
 * for a store IS asking for one account's data; there is no unscoped store to
 * accidentally reach for.
 */
const stores = new Map<string, Store>();

export async function getStore(accountId: string = DEFAULT_ACCOUNT_ID): Promise<Store> {
  const cached = stores.get(accountId);
  if (cached) return cached;

  let store: Store;
  if (process.env.DATABASE_URL) {
    const { PgStore } = await import('./pg-store');
    // Throws for anything but the default account: its data queries are not
    // scoped yet, and returning another account's rows is not a degraded mode.
    store = new PgStore(process.env.DATABASE_URL, accountId);
  } else {
    store = new FileStore(undefined, accountId);
  }
  await store.init();
  stores.set(accountId, store);
  return store;
}

/** Test hook: forget the cached stores so a fresh data file is picked up. */
export function resetStores(): void {
  stores.clear();
}

export { DEFAULT_ACCOUNT_ID } from './file-store';
export type { Store } from './store';
