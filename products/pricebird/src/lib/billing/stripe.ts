import Stripe from 'stripe';
import { getStore, type Account } from '@/lib/db';
import { PRICE_ENV, planFromStatus, type Interval } from './plans';

/**
 * Stripe, and the rule that a plan is only ever written from a verified
 * webhook.
 *
 * The shortcut is to mark the account paid when the browser lands on the
 * success URL. That URL is a GET the visitor controls - they can bookmark it,
 * share it, or open it without paying. Checkout completion is a hint; the
 * webhook is the fact. Nothing in this file upgrades an account except
 * handleWebhook(), and that refuses to run on an unverified payload.
 */

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function billingConfigProblems(): string[] {
  const problems: string[] = [];
  if (!process.env.STRIPE_SECRET_KEY) problems.push('STRIPE_SECRET_KEY is not set - checkout cannot be created.');
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    problems.push(
      'STRIPE_WEBHOOK_SECRET is not set - webhooks cannot be verified, so no payment would ever '
      + 'upgrade an account. Customers would be charged and stay on the free plan.',
    );
  }
  if (!process.env.APP_URL) problems.push('APP_URL is not set - checkout has nowhere to return the customer to.');
  for (const [interval, env] of Object.entries(PRICE_ENV)) {
    if (!process.env[env]) problems.push(`${env} is not set - the ${interval} plan cannot be sold.`);
  }
  return problems;
}

function client(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set.');
  return new Stripe(key);
}

function appUrl(): string {
  const url = process.env.APP_URL;
  if (!url) throw new Error('APP_URL is not set.');
  return url.replace(/\/$/, '');
}

/**
 * Starts a checkout for one account.
 *
 * The account id travels in client_reference_id and in the subscription's
 * metadata, so the webhook can identify the account from a checkout event or
 * from a later subscription event that has no session attached to it.
 */
export async function createCheckout(account: Account, interval: Interval): Promise<string> {
  const priceId = process.env[PRICE_ENV[interval]];
  if (!priceId) throw new Error(`${PRICE_ENV[interval]} is not set.`);

  const session = await client().checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: account.id,
    ...(account.stripe_customer_id
      ? { customer: account.stripe_customer_id }
      : account.email
        ? { customer_email: account.email }
        : {}),
    subscription_data: { metadata: { account_id: account.id } },
    // Stripe collects the email when we have none, and it is the identity the
    // account is recovered by, so it must reach us.
    customer_creation: account.stripe_customer_id ? undefined : 'always',
    allow_promotion_codes: true,
    success_url: `${appUrl()}/app?welcome=1`,
    cancel_url: `${appUrl()}/pricing?cancelled=1`,
  });

  if (!session.url) throw new Error('Stripe created a checkout session with no URL.');
  return session.url;
}

/** Cancel, change card, download invoices - all Stripe's problem, not ours. */
export async function portalUrl(account: Account): Promise<string> {
  if (!account.stripe_customer_id) throw new Error('This account has never been through checkout.');
  const session = await client().billingPortal.sessions.create({
    customer: account.stripe_customer_id,
    return_url: `${appUrl()}/account`,
  });
  return session.url;
}

/** Subscription fields Stripe sends under names that have changed over API
 *  versions; read defensively rather than pinned to one shape. */
function periodEnd(subscription: Stripe.Subscription): string | null {
  const raw = (subscription as unknown as { current_period_end?: number }).current_period_end
    ?? subscription.items?.data?.[0]?.current_period_end;
  return typeof raw === 'number' ? new Date(raw * 1000).toISOString() : null;
}

async function applySubscription(subscription: Stripe.Subscription): Promise<string> {
  const store = await getStore();
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  const accountId = subscription.metadata?.account_id ?? null;

  const account = (accountId ? await store.getAccount(accountId) : null)
    ?? await store.findAccountByCustomer(customerId);

  if (!account) {
    // Loud, not silent: a paying customer with no account row is a support
    // ticket waiting to happen, and the log line is what makes it findable.
    return `no account for customer ${customerId} (subscription ${subscription.id}) - nothing updated`;
  }

  const plan = planFromStatus(subscription.status);
  await store.updateBilling(account.id, {
    plan,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    subscription_status: subscription.status,
    current_period_end: periodEnd(subscription),
  });
  return `account ${account.id} -> ${plan} (${subscription.status})`;
}

/**
 * Verifies and applies one webhook.
 *
 * Every branch here is idempotent: Stripe retries, and it delivers events out
 * of order often enough that "created then updated" arriving backwards is a
 * normal Tuesday. Each event writes the full state it carries rather than a
 * delta, so a replay lands on the same row values.
 */
export async function handleWebhook(rawBody: string, signature: string | null): Promise<string> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not set - the payload cannot be verified.');
  if (!signature) throw new Error('No stripe-signature header; refusing to trust the payload.');

  const stripe = client();
  const event = stripe.webhooks.constructEvent(rawBody, signature, secret);

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const accountId = session.client_reference_id;
      const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;
      const email = session.customer_details?.email ?? null;

      if (accountId && customerId) {
        const store = await getStore();
        const account = await store.getAccount(accountId);
        if (account) {
          await store.updateBilling(account.id, { stripe_customer_id: customerId });
          // The email is how this account is recovered on another device, so
          // it is attached here rather than waiting for a sign-in - unless it
          // already belongs to an older account, which keeps it.
          if (email && !account.email) {
            const owner = await store.findAccountByEmail(email);
            if (!owner) await store.attachEmail(account.id, email);
          }
        }
      }

      if (typeof session.subscription === 'string') {
        return applySubscription(await stripe.subscriptions.retrieve(session.subscription));
      }
      return `checkout completed for ${accountId ?? 'unknown account'}`;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return applySubscription(event.data.object);

    default:
      return `ignored ${event.type}`;
  }
}
