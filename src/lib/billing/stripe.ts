import Stripe from 'stripe';
import { getStore } from '@/lib/db';
import type { Account } from '@/lib/types';
import { PLANS, type PlanKey, stateFromStripe } from './plans';

/**
 * Stripe, and the rule that the subscription state in our database is only
 * ever written from a verified webhook.
 *
 * The tempting shortcut is to mark an account paid when the browser comes back
 * from checkout with a success URL. That URL is a GET the user controls: they
 * can visit it without paying, share it, or replay it. Stripe's own guidance
 * is that checkout completion is a hint, and the webhook is the fact. This
 * module treats it that way - nothing here upgrades an account except
 * handleWebhook(), and that refuses to run on an unverified payload.
 */

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** Problems that would make a billing call fail confusingly, named up front. */
export function billingConfigProblems(): string[] {
  const problems: string[] = [];
  if (!process.env.STRIPE_SECRET_KEY) {
    problems.push('STRIPE_SECRET_KEY is not set - checkout cannot be created.');
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    problems.push(
      'STRIPE_WEBHOOK_SECRET is not set - webhooks cannot be verified, so no '
      + 'subscription change would ever be trusted and no account would ever be upgraded.',
    );
  }
  if (!process.env.APP_URL) {
    problems.push('APP_URL is not set - checkout has nowhere to return the customer to.');
  }
  for (const key of ['starter', 'growth', 'agency'] as const) {
    if (!process.env[priceEnv(key)]) {
      problems.push(`${priceEnv(key)} is not set - the ${key} plan cannot be sold.`);
    }
  }
  return problems;
}

/** Price ids live in the environment: they differ between test and live mode. */
export function priceEnv(plan: Exclude<PlanKey, 'trial'>): string {
  return `STRIPE_PRICE_${plan.toUpperCase()}`;
}

function client(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set.');
  return new Stripe(key);
}

/**
 * Starts a checkout for one account and one plan.
 *
 * The account id travels in client_reference_id AND in the subscription's
 * metadata, so the webhook can identify the account from either the checkout
 * event or a later subscription event that has no checkout attached.
 */
export async function createCheckout(account: Account, plan: Exclude<PlanKey, 'trial'>): Promise<string> {
  const price = process.env[priceEnv(plan)];
  if (!price) throw new Error(`${priceEnv(plan)} is not set - the ${plan} plan cannot be sold.`);
  const appUrl = process.env.APP_URL;
  if (!appUrl) throw new Error('APP_URL is not set - checkout has nowhere to return to.');

  const session = await client().checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price, quantity: 1 }],
    client_reference_id: account.id,
    customer: account.stripe_customer_id ?? undefined,
    customer_email: account.stripe_customer_id ? undefined : account.email,
    subscription_data: { metadata: { account_id: account.id, plan } },
    metadata: { account_id: account.id, plan },
    success_url: `${appUrl}/billing?checkout=complete`,
    cancel_url: `${appUrl}/billing?checkout=cancelled`,
  });

  if (!session.url) throw new Error('Stripe returned a checkout session with no URL.');
  return session.url;
}

/** Which plan a Stripe price id corresponds to, or null if we do not sell it. */
export function planForPrice(priceId: string): PlanKey | null {
  for (const key of ['starter', 'growth', 'agency'] as const) {
    if (process.env[priceEnv(key)] === priceId) return key;
  }
  return null;
}

export interface WebhookOutcome {
  /** What we did, in words, for the log and for the response body. */
  handled: string;
  account_id: string | null;
}

/**
 * Verifies and applies a Stripe webhook.
 *
 * `rawBody` must be the exact bytes Stripe sent. Parsing the JSON first and
 * re-serialising it breaks the signature, which is the most common way this
 * check gets silently disabled.
 */
export async function handleWebhook(rawBody: string, signature: string | null): Promise<WebhookOutcome> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not set - refusing to trust this payload.');
  if (!signature) throw new Error('No stripe-signature header - refusing to trust this payload.');

  // Throws on a bad signature. Nothing below this line runs on a forged event,
  // which is the whole point: without it, anyone who knows the URL could
  // upgrade their own account by posting JSON at it.
  const event = client().webhooks.constructEvent(rawBody, signature, secret);
  const store = await getStore();

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const accountId = session.client_reference_id ?? session.metadata?.account_id ?? null;
      if (!accountId) return { handled: 'checkout completed with no account reference', account_id: null };
      await store.updateAccount(accountId, {
        stripe_customer_id: typeof session.customer === 'string' ? session.customer : null,
        stripe_subscription_id: typeof session.subscription === 'string' ? session.subscription : null,
      });
      return { handled: 'linked the Stripe customer to the account', account_id: accountId };
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const accountId = sub.metadata?.account_id
        ?? (await accountIdForCustomer(sub.customer));
      if (!accountId) return { handled: 'subscription event for an unknown account', account_id: null };

      const priceId = sub.items.data[0]?.price?.id;
      const plan = priceId ? planForPrice(priceId) : null;
      const state = event.type === 'customer.subscription.deleted'
        ? 'canceled'
        : stateFromStripe(sub.status);

      await store.updateAccount(accountId, {
        // A cancelled subscription drops to the trial's entitlements rather
        // than to nothing, so their data stays reachable and they can come
        // back without support having to reinstate anything.
        plan: state === 'canceled' ? 'trial' : (plan ?? 'starter'),
        subscription_state: state,
        stripe_subscription_id: sub.id,
        current_period_end: periodEnd(sub),
      });
      return { handled: `subscription is ${state}`, account_id: accountId };
    }

    default:
      // Unhandled types are acknowledged rather than errored, or Stripe retries
      // them forever and the endpoint looks broken in their dashboard.
      return { handled: `ignored ${event.type}`, account_id: null };
  }
}

async function accountIdForCustomer(customer: string | Stripe.Customer | Stripe.DeletedCustomer): Promise<string | null> {
  const id = typeof customer === 'string' ? customer : customer.id;
  const store = await getStore();
  return (await store.findAccountByStripeCustomer(id))?.id ?? null;
}

/** Stripe moved this field around between versions; read it defensively. */
function periodEnd(sub: Stripe.Subscription): string | null {
  const raw = (sub as unknown as { current_period_end?: number }).current_period_end
    ?? (sub.items.data[0] as unknown as { current_period_end?: number } | undefined)?.current_period_end;
  return typeof raw === 'number' ? new Date(raw * 1000).toISOString() : null;
}

/** Exported for the plans page, so it never invents a price the code cannot sell. */
export function sellablePlans(): Array<{ plan: PlanKey; price_configured: boolean }> {
  return (['starter', 'growth', 'agency'] as const).map((plan) => ({
    plan,
    price_configured: Boolean(process.env[priceEnv(plan)]),
  }));
}

export { PLANS };
