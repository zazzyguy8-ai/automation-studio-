import { NextResponse } from 'next/server';
import { handleWebhook } from '@/lib/billing/stripe';

export const runtime = 'nodejs';

/**
 * Stripe's webhook endpoint.
 *
 * The raw body is read as text, never parsed first: signature verification is
 * over the exact bytes Stripe sent, and JSON.parse followed by re-serialising
 * changes them.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get('stripe-signature');

  try {
    const outcome = await handleWebhook(raw, signature);
    console.info(`[stripe] ${outcome}`);
    return NextResponse.json({ received: true, outcome });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook rejected.';
    console.error(`[stripe] ${message}`);
    // 400 so Stripe retries a transient failure and shows the error in the
    // dashboard, which is where an operator will actually look.
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
