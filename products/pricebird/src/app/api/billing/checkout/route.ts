import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SESSION_COOKIE, accountForRequest, sessionCookieOptions } from '@/lib/auth';
import { billingConfigProblems, createCheckout } from '@/lib/billing/stripe';

export const runtime = 'nodejs';

const BodySchema = z.object({ interval: z.enum(['monthly', 'yearly']).default('monthly') });

export async function POST(request: Request) {
  const problems = billingConfigProblems();
  if (problems.length > 0) {
    // Named rather than swallowed: a 500 here means the operator has not
    // finished setting Stripe up, and they need to be told which line.
    return NextResponse.json({ error: `Billing is not configured. ${problems.join(' ')}` }, { status: 503 });
  }

  const { interval } = BodySchema.parse(await request.json().catch(() => ({})));
  const { account, setCookie } = await accountForRequest();

  try {
    const url = await createCheckout(account, interval);
    const response = NextResponse.json({ url });
    if (setCookie) response.cookies.set(SESSION_COOKIE, setCookie, sessionCookieOptions);
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Checkout could not be started.' },
      { status: 502 },
    );
  }
}
