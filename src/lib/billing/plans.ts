/**
 * What a subscription buys.
 *
 * These numbers are not marketing. They are the reason the product does not
 * lose money on its own customers: an audit is the expensive part of a run,
 * and without a ceiling on audits a single enthusiastic account can spend more
 * on model calls in a week than it pays in a year.
 *
 * The caps below are set against that arithmetic, so every plan stays above
 * its own running cost with room for the rest of the business.
 */

export const PLAN_KEYS = ['trial', 'starter', 'growth', 'agency'] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export interface Plan {
  key: PlanKey;
  name: string;
  /** Cents, so no float ever touches money. */
  price_eur_month: number;
  /** The expensive ceiling: how many sites may be read and analysed. */
  audits_per_month: number;
  /** Discovery is cheap by comparison, but not free. */
  leads_per_day: number;
  /** How many campaigns can run at once. */
  campaigns: number;
  /** Verified sending domains. One account, one sender, unless they pay for more. */
  sending_domains: number;
  blurb: string;
}

export const PLANS: Record<PlanKey, Plan> = {
  trial: {
    key: 'trial',
    name: 'Trial',
    price_eur_month: 0,
    audits_per_month: 25,
    leads_per_day: 10,
    campaigns: 1,
    sending_domains: 1,
    blurb: 'Enough to see real companies and real drafts before paying anything.',
  },
  starter: {
    key: 'starter',
    name: 'Starter',
    price_eur_month: 4900,
    audits_per_month: 150,
    leads_per_day: 25,
    campaigns: 2,
    sending_domains: 1,
    blurb: 'One market, one offer. The audit budget is what this buys.',
  },
  growth: {
    key: 'growth',
    name: 'Growth',
    price_eur_month: 14900,
    audits_per_month: 600,
    leads_per_day: 60,
    campaigns: 6,
    sending_domains: 3,
    blurb: 'Several cities or several offers, running at once.',
  },
  agency: {
    key: 'agency',
    name: 'Agency',
    price_eur_month: 39900,
    audits_per_month: 2000,
    leads_per_day: 150,
    campaigns: 25,
    sending_domains: 10,
    blurb: 'Running outreach on behalf of your own clients.',
  },
};

/** Subscription states we act on. Everything Stripe reports maps into one. */
export const SUBSCRIPTION_STATES = ['trialing', 'active', 'past_due', 'canceled'] as const;
export type SubscriptionState = (typeof SUBSCRIPTION_STATES)[number];

/**
 * Whether an account in this state may spend money on its behalf.
 *
 * `past_due` deliberately still runs. A card that expired on a Friday should
 * not silently stop a customer's pipeline over the weekend - it should nag
 * them. Cancelled stops, because at that point they have said no.
 */
export function canRun(state: SubscriptionState): boolean {
  return state === 'trialing' || state === 'active' || state === 'past_due';
}

/** Maps a Stripe subscription status onto ours, defaulting to the safe end. */
export function stateFromStripe(status: string): SubscriptionState {
  switch (status) {
    case 'trialing': return 'trialing';
    case 'active': return 'active';
    case 'past_due':
    case 'unpaid': return 'past_due';
    // incomplete, incomplete_expired, canceled, paused and anything Stripe adds
    // later all mean "do not spend money on this account".
    default: return 'canceled';
  }
}
