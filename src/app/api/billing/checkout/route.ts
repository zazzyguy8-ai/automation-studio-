import { NextResponse } from 'next/server';
import { billingConfigProblems, createCheckout } from '@/lib/billing/stripe';
import { getStore } from '@/lib/db';
import type { PlanKey } from '@/lib/billing/plans';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const plan = body.plan as PlanKey | undefined;
  const accountId = body.account_id as string | undefined;

  if (plan !== 'starter' && plan !== 'growth' && plan !== 'agency') {
    return NextResponse.json({ error: 'Pick a paid plan: starter, growth or agency.' }, { status: 400 });
  }
  if (!accountId) {
    return NextResponse.json({ error: 'account_id is required.' }, { status: 400 });
  }

  // Say what is missing rather than letting Stripe fail with something the
  // operator cannot act on.
  const problems = billingConfigProblems();
  if (problems.length > 0) {
    return NextResponse.json({ error: 'Billing is not configured.', problems }, { status: 503 });
  }

  const store = await getStore();
  const account = await store.getAccount(accountId);
  if (!account) return NextResponse.json({ error: 'No such account.' }, { status: 404 });

  try {
    return NextResponse.json({ url: await createCheckout(account, plan) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
