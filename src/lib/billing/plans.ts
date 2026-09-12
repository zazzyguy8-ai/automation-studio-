import { type CallKey, MIN_MARGIN, maxAuditsForMargin } from './cost';

/**
 * What a subscription buys.
 *
 * Every ceiling here was derived from cost.ts rather than chosen, and the test
 * suite recomputes the margin from the same model - so a plan cannot drift
 * into losing money without a test going red.
 *
 * The first version of this file did lose money: 150 Opus audits for EUR 49 is
 * a 52% LOSS, and the 2,000-audit tier lost $587 per customer per month. The
 * mistake was checking that the tiers were consistent with each other and
 * never checking any of them against what a call actually costs.
 *
 * The lever that fixes it is which model reads the site. An Opus audit costs
 * roughly three times a Sonnet one, almost all of it thinking tokens, so the
 * model is what separates the tiers - not an arbitrary number of credits.
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
  /**
   * Which call this plan's audits run as. This is the cost driver and the
   * quality difference, and the engine reads it - a plan that claimed Sonnet
   * while the engine ran Opus would be the same lie the margin is meant to
   * prevent.
   */
  audit_call: CallKey;
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
    audits_per_month: 20,
    audit_call: 'audit_sonnet',
    leads_per_day: 10,
    campaigns: 1,
    sending_domains: 1,
    blurb: 'Enough to see real companies and real drafts before paying anything.',
  },
  starter: {
    key: 'starter',
    name: 'Starter',
    price_eur_month: 4900,
    // Ceiling is 76 at this price; 70 leaves room for the estimates in cost.ts
    // to be wrong in the wrong direction.
    audits_per_month: 70,
    audit_call: 'audit_sonnet',
    leads_per_day: 25,
    campaigns: 2,
    sending_domains: 1,
    blurb: 'One market, one offer. Sites are read by Sonnet.',
  },
  growth: {
    key: 'growth',
    name: 'Growth',
    price_eur_month: 14900,
    audits_per_month: 250,
    audit_call: 'audit_sonnet',
    leads_per_day: 60,
    campaigns: 6,
    sending_domains: 3,
    blurb: 'Several cities or several offers, running at once.',
  },
  agency: {
    key: 'agency',
    name: 'Agency',
    price_eur_month: 39900,
    audits_per_month: 300,
    // The tier that buys the better analysis, which is what actually closes a
    // high-ticket sale. Fewer audits than Growth, deliberately - they are
    // worth more each.
    audit_call: 'audit_medium',
    leads_per_day: 150,
    campaigns: 25,
    sending_domains: 10,
    blurb: 'Sites are read by Opus. Fewer audits, each one sharper.',
  },
};

/** Headroom left under the margin floor, for sanity-checking a price change. */
export function planHeadroom(plan: Plan): { ceiling: number; using: number; spare: number } {
  const ceiling = maxAuditsForMargin(plan.price_eur_month, plan.audit_call);
  return { ceiling, using: plan.audits_per_month, spare: ceiling - plan.audits_per_month };
}

export { MIN_MARGIN };

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
