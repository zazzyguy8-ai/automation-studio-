import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Listing } from '@/lib/listing/schema';
import type { Platform } from '@/lib/listing/platforms';

/**
 * Storage, and the one thing it deliberately does not store: the photos.
 *
 * A listing's JSON is kept so the seller can reopen it on their laptop. The
 * image is not: it is sent to the model and dropped. That keeps the storage
 * bill at roughly nothing, removes the whole class of "someone uploaded a
 * photo of their passport" incident, and means a data request has a short
 * answer. The account row and the listing text are all there is.
 */

export type Plan = 'free' | 'pro';

export interface Account {
  id: string;
  email: string | null;
  plan: Plan;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  /** Stripe's own word for the subscription, kept verbatim for support. */
  subscription_status: string | null;
  current_period_end: string | null;
  created_at: string;
}

export interface SavedListing {
  id: string;
  account_id: string;
  created_at: string;
  platform: Platform;
  listing: Listing;
}

export interface LoginCode {
  email: string;
  code_hash: string;
  expires_at: string;
  attempts: number;
}

export interface BillingUpdate {
  plan?: Plan;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  subscription_status?: string | null;
  current_period_end?: string | null;
}

export interface Store {
  init(): Promise<void>;
  createAccount(email?: string | null): Promise<Account>;
  getAccount(id: string): Promise<Account | null>;
  findAccountByEmail(email: string): Promise<Account | null>;
  findAccountByCustomer(customerId: string): Promise<Account | null>;
  attachEmail(id: string, email: string): Promise<Account>;
  updateBilling(id: string, update: BillingUpdate): Promise<void>;
  saveListing(accountId: string, platform: Platform, listing: Listing): Promise<SavedListing>;
  recentListings(accountId: string, limit: number): Promise<SavedListing[]>;
  countListings(accountId: string, since?: Date): Promise<number>;
  putLoginCode(code: LoginCode): Promise<void>;
  getLoginCode(email: string): Promise<LoginCode | null>;
  bumpLoginAttempts(email: string): Promise<void>;
  clearLoginCode(email: string): Promise<void>;
}

const nowIso = () => new Date().toISOString();
const normalizeEmail = (email: string) => email.trim().toLowerCase();

function blankAccount(email: string | null): Account {
  return {
    id: randomUUID(),
    email,
    plan: 'free',
    stripe_customer_id: null,
    stripe_subscription_id: null,
    subscription_status: null,
    current_period_end: null,
    created_at: nowIso(),
  };
}

/* ------------------------------------------------------------------ *
 * Local store: a JSON file, for development and the offline tests.
 * ------------------------------------------------------------------ */

interface Snapshot {
  accounts: Account[];
  listings: SavedListing[];
  codes: LoginCode[];
}

export class FileStore implements Store {
  private path: string;
  private data: Snapshot = { accounts: [], listings: [], codes: [] };

  constructor(path = process.env.PRICEBIRD_DATA_FILE ?? join(process.cwd(), '.data', 'pricebird.json')) {
    this.path = path;
  }

  async init(): Promise<void> {
    try {
      this.data = JSON.parse(await readFile(this.path, 'utf8')) as Snapshot;
    } catch {
      this.data = { accounts: [], listings: [], codes: [] };
    }
  }

  private async flush(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, JSON.stringify(this.data, null, 2));
  }

  async createAccount(email: string | null = null): Promise<Account> {
    const account = blankAccount(email ? normalizeEmail(email) : null);
    this.data.accounts.push(account);
    await this.flush();
    return account;
  }

  async getAccount(id: string): Promise<Account | null> {
    return this.data.accounts.find((a) => a.id === id) ?? null;
  }

  async findAccountByEmail(email: string): Promise<Account | null> {
    const wanted = normalizeEmail(email);
    return this.data.accounts.find((a) => a.email === wanted) ?? null;
  }

  async findAccountByCustomer(customerId: string): Promise<Account | null> {
    return this.data.accounts.find((a) => a.stripe_customer_id === customerId) ?? null;
  }

  async attachEmail(id: string, email: string): Promise<Account> {
    const account = this.data.accounts.find((a) => a.id === id);
    if (!account) throw new Error(`No account ${id}`);
    account.email = normalizeEmail(email);
    await this.flush();
    return account;
  }

  async updateBilling(id: string, update: BillingUpdate): Promise<void> {
    const account = this.data.accounts.find((a) => a.id === id);
    if (!account) throw new Error(`No account ${id}`);
    Object.assign(account, update);
    await this.flush();
  }

  async saveListing(accountId: string, platform: Platform, listing: Listing): Promise<SavedListing> {
    const saved: SavedListing = { id: randomUUID(), account_id: accountId, created_at: nowIso(), platform, listing };
    this.data.listings.push(saved);
    await this.flush();
    return saved;
  }

  async recentListings(accountId: string, limit: number): Promise<SavedListing[]> {
    return this.data.listings
      .filter((l) => l.account_id === accountId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  }

  async countListings(accountId: string, since?: Date): Promise<number> {
    return this.data.listings.filter(
      (l) => l.account_id === accountId && (!since || new Date(l.created_at) >= since),
    ).length;
  }

  async putLoginCode(code: LoginCode): Promise<void> {
    const email = normalizeEmail(code.email);
    this.data.codes = this.data.codes.filter((c) => c.email !== email);
    this.data.codes.push({ ...code, email });
    await this.flush();
  }

  async getLoginCode(email: string): Promise<LoginCode | null> {
    return this.data.codes.find((c) => c.email === normalizeEmail(email)) ?? null;
  }

  async bumpLoginAttempts(email: string): Promise<void> {
    const code = this.data.codes.find((c) => c.email === normalizeEmail(email));
    if (code) code.attempts += 1;
    await this.flush();
  }

  async clearLoginCode(email: string): Promise<void> {
    this.data.codes = this.data.codes.filter((c) => c.email !== normalizeEmail(email));
    await this.flush();
  }
}

/* ------------------------------------------------------------------ *
 * Postgres, for anything with a real customer in it.
 * ------------------------------------------------------------------ */

export class PgStore implements Store {
  private pool: import('pg').Pool | null = null;
  private url: string;

  constructor(url: string) {
    this.url = url;
  }

  private async client(): Promise<import('pg').Pool> {
    if (!this.pool) {
      const { Pool } = await import('pg');
      this.pool = new Pool({
        connectionString: this.url,
        // Supabase and Neon both terminate unencrypted connections; the
        // certificate chain is theirs, not ours, so verification is off for
        // the same reason every hosted Postgres client library does it.
        ssl: this.url.includes('localhost') ? undefined : { rejectUnauthorized: false },
        max: 4,
      });
    }
    return this.pool;
  }

  private async query<T>(text: string, values: unknown[] = []): Promise<T[]> {
    const pool = await this.client();
    const result = await pool.query(text, values);
    return result.rows as T[];
  }

  async init(): Promise<void> {
    await this.query('select 1');
  }

  async createAccount(email: string | null = null): Promise<Account> {
    const [row] = await this.query<Account>(
      `insert into accounts (id, email) values ($1, $2)
       returning id, email, plan, stripe_customer_id, stripe_subscription_id,
                 subscription_status, current_period_end, created_at`,
      [randomUUID(), email ? normalizeEmail(email) : null],
    );
    return row;
  }

  async getAccount(id: string): Promise<Account | null> {
    const [row] = await this.query<Account>('select * from accounts where id = $1', [id]);
    return row ?? null;
  }

  async findAccountByEmail(email: string): Promise<Account | null> {
    const [row] = await this.query<Account>('select * from accounts where email = $1', [normalizeEmail(email)]);
    return row ?? null;
  }

  async findAccountByCustomer(customerId: string): Promise<Account | null> {
    const [row] = await this.query<Account>('select * from accounts where stripe_customer_id = $1', [customerId]);
    return row ?? null;
  }

  async attachEmail(id: string, email: string): Promise<Account> {
    const [row] = await this.query<Account>(
      'update accounts set email = $2 where id = $1 returning *',
      [id, normalizeEmail(email)],
    );
    if (!row) throw new Error(`No account ${id}`);
    return row;
  }

  async updateBilling(id: string, update: BillingUpdate): Promise<void> {
    const columns = Object.keys(update);
    if (columns.length === 0) return;
    const sets = columns.map((c, i) => `${c} = $${i + 2}`).join(', ');
    await this.query(`update accounts set ${sets} where id = $1`, [id, ...columns.map((c) => (update as Record<string, unknown>)[c])]);
  }

  async saveListing(accountId: string, platform: Platform, listing: Listing): Promise<SavedListing> {
    const [row] = await this.query<SavedListing>(
      `insert into listings (id, account_id, platform, listing)
       values ($1, $2, $3, $4) returning id, account_id, created_at, platform, listing`,
      [randomUUID(), accountId, platform, JSON.stringify(listing)],
    );
    return row;
  }

  async recentListings(accountId: string, limit: number): Promise<SavedListing[]> {
    return this.query<SavedListing>(
      'select id, account_id, created_at, platform, listing from listings where account_id = $1 order by created_at desc limit $2',
      [accountId, limit],
    );
  }

  async countListings(accountId: string, since?: Date): Promise<number> {
    const [row] = since
      ? await this.query<{ count: string }>(
        'select count(*)::text as count from listings where account_id = $1 and created_at >= $2',
        [accountId, since.toISOString()],
      )
      : await this.query<{ count: string }>(
        'select count(*)::text as count from listings where account_id = $1', [accountId],
      );
    return Number(row?.count ?? 0);
  }

  async putLoginCode(code: LoginCode): Promise<void> {
    await this.query(
      `insert into login_codes (email, code_hash, expires_at, attempts)
       values ($1, $2, $3, 0)
       on conflict (email) do update set code_hash = excluded.code_hash,
         expires_at = excluded.expires_at, attempts = 0`,
      [normalizeEmail(code.email), code.code_hash, code.expires_at],
    );
  }

  async getLoginCode(email: string): Promise<LoginCode | null> {
    const [row] = await this.query<LoginCode>('select * from login_codes where email = $1', [normalizeEmail(email)]);
    return row ?? null;
  }

  async bumpLoginAttempts(email: string): Promise<void> {
    await this.query('update login_codes set attempts = attempts + 1 where email = $1', [normalizeEmail(email)]);
  }

  async clearLoginCode(email: string): Promise<void> {
    await this.query('delete from login_codes where email = $1', [normalizeEmail(email)]);
  }
}

let cached: Store | null = null;

export async function getStore(): Promise<Store> {
  if (cached) return cached;
  const store: Store = process.env.DATABASE_URL ? new PgStore(process.env.DATABASE_URL) : new FileStore();
  await store.init();
  cached = store;
  return store;
}

/** Test hook: forget the cached store so a fresh data file is picked up. */
export function resetStore(): void {
  cached = null;
}
