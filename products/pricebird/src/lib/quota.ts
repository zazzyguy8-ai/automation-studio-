import { getStore, type Account } from '@/lib/db';
import { PLANS } from '@/lib/billing/plans';

export interface Quota {
  plan: Account['plan'];
  used: number;
  limit: number;
  remaining: number;
  window: 'lifetime' | 'month';
  allowed: boolean;
  /** What to say when it is spent. Empty when there is room left. */
  message: string;
}

/**
 * The paid window is the calendar month, not the billing anniversary.
 *
 * Anniversary windows are more correct and nobody can hold them in their head:
 * a seller who signed up on the 23rd cannot tell you when their allowance
 * resets. Since the cap is a runaway guard rather than a meter anyone is meant
 * to reach, the version a human can predict wins.
 */
function monthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function quotaFor(account: Account): Promise<Quota> {
  const spec = PLANS[account.plan];
  const store = await getStore();
  const used = await store.countListings(account.id, spec.window === 'month' ? monthStart() : undefined);
  const remaining = Math.max(0, spec.limit - used);

  return {
    plan: account.plan,
    used,
    limit: spec.limit,
    remaining,
    window: spec.window,
    allowed: remaining > 0,
    message: remaining > 0
      ? ''
      : account.plan === 'free'
        ? `You have used all ${spec.limit} free listings. Pro is ${PLANS.pro.priceLabel} and lifts the cap.`
        : `You have hit ${spec.limit} listings this month, which is the fair-use cap. Reply to your receipt and we will raise it.`,
  };
}
