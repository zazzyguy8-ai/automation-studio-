import type { Plan } from '@/lib/db';

/**
 * What each plan costs and what it allows.
 *
 * The free tier is a lifetime allowance, not a monthly one. A monthly free
 * allowance is a subscription someone never pays for: a casual seller with
 * three items a month never hits it and never converts, while the reseller
 * this is built for burns five listings in an evening and decides on the spot.
 * Five is enough to see whether the output is good and not enough to run a
 * shop on.
 *
 * The paid cap exists to bound the model bill, not to upsell. At roughly two
 * cents of inference per listing, 300 a month is about six dollars against a
 * nine dollar price - and nobody photographing items by hand reaches it. It
 * is a runaway-script guard.
 */
export interface PlanSpec {
  key: Plan;
  label: string;
  /** Listings allowed in the window. */
  limit: number;
  window: 'lifetime' | 'month';
  priceLabel: string;
}

export const PLANS: Record<Plan, PlanSpec> = {
  free: { key: 'free', label: 'Free', limit: 5, window: 'lifetime', priceLabel: '$0' },
  pro: { key: 'pro', label: 'Pro', limit: 300, window: 'month', priceLabel: '$9 / month' },
};

export type Interval = 'monthly' | 'yearly';

export const PRICE_ENV: Record<Interval, string> = {
  monthly: 'STRIPE_PRICE_MONTHLY',
  yearly: 'STRIPE_PRICE_YEARLY',
};

/**
 * Which Stripe subscription statuses mean "let them in".
 *
 * `past_due` is deliberately included: the card failed, Stripe is retrying,
 * and locking someone out mid-retry over a bank decline is how you turn a
 * temporary payment problem into a cancellation. Stripe moves the
 * subscription to `canceled` or `unpaid` when the retries are exhausted, and
 * that is when access ends.
 */
const ACTIVE_STATUSES = new Set(['active', 'trialing', 'past_due']);

export function planFromStatus(status: string | null | undefined): Plan {
  return status && ACTIVE_STATUSES.has(status) ? 'pro' : 'free';
}
