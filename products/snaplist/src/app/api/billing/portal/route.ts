import { NextResponse } from 'next/server';
import { currentAccount } from '@/lib/auth';
import { portalUrl } from '@/lib/billing/stripe';

export const runtime = 'nodejs';

export async function POST() {
  const account = await currentAccount();
  if (!account) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  if (!account.stripe_customer_id) {
    return NextResponse.json({ error: 'This account has no subscription to manage.' }, { status: 400 });
  }

  try {
    return NextResponse.json({ url: await portalUrl(account) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The billing portal could not be opened.' },
      { status: 502 },
    );
  }
}
