import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { getStore, type Account } from '@/lib/db';

/**
 * Who is asking, without a password and without a signup wall.
 *
 * The first listing anyone makes creates an account with no email on it and
 * puts its id in a signed cookie. That is the whole free tier: no form, no
 * verification, no "create an account to see your result". An email is only
 * attached when they pay or when they want the account on a second device,
 * and at that point a six-digit code is enough.
 *
 * The cookie is signed, not encrypted. It carries an account id, which is a
 * random uuid and not a secret; what matters is that a visitor cannot mint one
 * for somebody else's account, and an HMAC settles that.
 */

export const SESSION_COOKIE = 'pb_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 180; // 180 days
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error(
      'SESSION_SECRET is not set, or is shorter than 32 characters. Generate one with '
      + '`openssl rand -hex 32`. Without it, session cookies cannot be signed and anyone '
      + 'could hand themselves another account\'s id.',
    );
  }
  return value;
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function issueSession(accountId: string): string {
  const payload = `${accountId}.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

/** Returns the account id a cookie proves, or null for anything else. */
export function readSession(value: string | undefined): string | null {
  if (!value) return null;
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  const [id, issued, mac] = parts;
  if (!safeEqual(mac, sign(`${id}.${issued}`))) return null;
  if (Date.now() - Number(issued) > SESSION_MAX_AGE * 1000) return null;
  return id;
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: SESSION_MAX_AGE,
} as const;

/** The signed-in account, or null. Never creates one - pages only read. */
export async function currentAccount(): Promise<Account | null> {
  const jar = await cookies();
  const id = readSession(jar.get(SESSION_COOKIE)?.value);
  if (!id) return null;
  const store = await getStore();
  return store.getAccount(id);
}

/**
 * The account for a request, creating one on first use.
 *
 * Only route handlers may call this: it returns a cookie value the caller has
 * to set on the response, because a server component cannot.
 */
export async function accountForRequest(): Promise<{ account: Account; setCookie: string | null }> {
  const existing = await currentAccount();
  if (existing) return { account: existing, setCookie: null };

  const store = await getStore();
  const account = await store.createAccount();
  return { account, setCookie: issueSession(account.id) };
}

/* ---------------------------- sign-in codes ---------------------------- */

export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** Codes are stored hashed with the app secret, so a database dump is not a
 *  list of live sign-in codes. */
export function hashCode(email: string, code: string): string {
  return createHmac('sha256', secret()).update(`${email.trim().toLowerCase()}:${code}`).digest('hex');
}

export interface CodeCheck {
  ok: boolean;
  reason: 'ok' | 'expired' | 'wrong' | 'locked' | 'none';
}

export async function checkCode(email: string, code: string): Promise<CodeCheck> {
  const store = await getStore();
  const record = await store.getLoginCode(email);
  if (!record) return { ok: false, reason: 'none' };
  if (record.attempts >= MAX_CODE_ATTEMPTS) return { ok: false, reason: 'locked' };
  if (new Date(record.expires_at).getTime() < Date.now()) return { ok: false, reason: 'expired' };

  if (!safeEqual(record.code_hash, hashCode(email, code))) {
    await store.bumpLoginAttempts(email);
    return { ok: false, reason: 'wrong' };
  }
  await store.clearLoginCode(email);
  return { ok: true, reason: 'ok' };
}

export function codeExpiry(): string {
  return new Date(Date.now() + CODE_TTL_MS).toISOString();
}

/**
 * Puts an email on an account and merges the two histories if that address
 * already has one.
 *
 * The case this exists for: someone used the free tier on their phone, then
 * paid on their laptop. Two anonymous accounts, one person. The email is the
 * identity, so the account that already owns it wins and the caller is handed
 * back the id its session should switch to.
 */
export async function claimEmail(currentId: string, email: string): Promise<Account> {
  const store = await getStore();
  const owner = await store.findAccountByEmail(email);
  if (owner) return owner;
  return store.attachEmail(currentId, email);
}
