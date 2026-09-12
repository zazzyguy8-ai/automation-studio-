import { NextResponse } from 'next/server';
import { billingConfigProblems } from '@/lib/billing/stripe';
import { mailConfigProblems } from '@/lib/mail';
import { getStore } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Is the deployed instance actually wired up?
 *
 * This exists because the failure it catches is invisible: a site that loads,
 * looks finished, takes a payment, and never upgrades the account because the
 * webhook secret was not copied across. Opening one URL is a check you will
 * actually do; running a script against production env vars is one you will
 * not.
 *
 * It reports the NAMES of missing settings and never their values, so it is
 * safe to leave open. Knowing that STRIPE_WEBHOOK_SECRET is unset tells an
 * attacker nothing they could not learn by paying and watching what happens.
 */
export async function GET() {
  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

  checks.push({
    name: 'listings',
    ok: Boolean(process.env.ANTHROPIC_API_KEY),
    detail: process.env.ANTHROPIC_API_KEY ? 'Claude key present' : 'ANTHROPIC_API_KEY is not set',
  });

  checks.push({
    name: 'sessions',
    ok: (process.env.SESSION_SECRET ?? '').length >= 32,
    detail: (process.env.SESSION_SECRET ?? '').length >= 32
      ? 'session secret present'
      : 'SESSION_SECRET is missing or under 32 characters',
  });

  const billing = billingConfigProblems();
  checks.push({
    name: 'billing',
    ok: billing.length === 0,
    detail: billing.length === 0 ? 'Stripe configured' : billing.join(' '),
  });

  const mail = mailConfigProblems();
  checks.push({
    name: 'email',
    ok: mail.length === 0,
    detail: mail.length === 0 ? 'Resend configured' : mail.join(' '),
  });

  if (!process.env.DATABASE_URL) {
    checks.push({
      name: 'database',
      ok: false,
      detail: 'DATABASE_URL is not set - accounts are written to a file and will not survive a restart',
    });
  } else {
    try {
      await getStore();
      checks.push({ name: 'database', ok: true, detail: 'connected' });
    } catch (error) {
      checks.push({
        name: 'database',
        ok: false,
        detail: `could not connect: ${error instanceof Error ? error.message : 'unknown error'}`,
      });
    }
  }

  const ok = checks.every((check) => check.ok);
  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 503 });
}
