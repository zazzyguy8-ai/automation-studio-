import { NextResponse } from 'next/server';
import { handleWebhook } from '@/lib/billing/stripe';

/**
 * Stripe's webhook endpoint.
 *
 * Reads the raw body, not req.json(): the signature is computed over the exact
 * bytes Stripe sent, so parsing and re-serialising would break verification -
 * which is how signature checks get disabled by accident.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get('stripe-signature');

  try {
    const outcome = await handleWebhook(raw, signature);
    return NextResponse.json(outcome);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // 400 tells Stripe the event was rejected. Retrying will not help a forged
    // or misconfigured payload, and a 500 would have them retry for days.
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
