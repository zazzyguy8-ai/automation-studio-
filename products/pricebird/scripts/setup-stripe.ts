/**
 * Creates the product, the two prices and the webhook endpoint in Stripe, and
 * prints the environment lines to paste.
 *
 * Idempotent by metadata: run it against test mode, run it again against live
 * mode, run it twice by accident - it finds what it already made instead of
 * creating a second $9 price. Duplicate prices are how a customer ends up
 * subscribed to an object nothing in the app references.
 *
 *   npm run setup:stripe                 # product + prices
 *   npm run setup:stripe -- --webhook    # also register the webhook endpoint
 */
import Stripe from 'stripe';

const MONTHLY_CENTS = 900;
const YEARLY_CENTS = 7900;
const CURRENCY = 'usd';

/** The events the app actually handles. Registering more means Stripe retries
 *  deliveries for things the endpoint ignores, which fills the dashboard with
 *  noise an operator then learns to ignore. */
const EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
];

async function findOrCreateProduct(stripe: Stripe): Promise<Stripe.Product> {
  const existing = await stripe.products.list({ limit: 100, active: true });
  const found = existing.data.find((p) => p.metadata?.app === 'pricebird');
  if (found) {
    console.log(`product   ${found.id} (existing)`);
    return found;
  }

  const created = await stripe.products.create({
    name: 'Pricebird Pro',
    description: 'Unlimited marketplace listings from photos.',
    metadata: { app: 'pricebird' },
  });
  console.log(`product   ${created.id} (created)`);
  return created;
}

async function findOrCreatePrice(
  stripe: Stripe,
  product: Stripe.Product,
  slug: 'monthly' | 'yearly',
  amount: number,
  interval: 'month' | 'year',
): Promise<Stripe.Price> {
  const existing = await stripe.prices.list({ product: product.id, limit: 100, active: true });
  const found = existing.data.find((p) => p.metadata?.slug === slug);
  if (found) {
    console.log(`${slug.padEnd(9)} ${found.id} (existing)`);
    return found;
  }

  const created = await stripe.prices.create({
    product: product.id,
    unit_amount: amount,
    currency: CURRENCY,
    recurring: { interval },
    metadata: { slug },
  });
  console.log(`${slug.padEnd(9)} ${created.id} (created)`);
  return created;
}

async function setUpWebhook(stripe: Stripe, appUrl: string): Promise<string | null> {
  const url = `${appUrl.replace(/\/$/, '')}/api/billing/webhook`;
  const existing = await stripe.webhookEndpoints.list({ limit: 100 });
  const found = existing.data.find((e) => e.url === url);

  if (found) {
    console.log(`webhook   ${found.id} (existing, pointing at ${url})`);
    // The signing secret is only ever returned at creation. An endpoint that
    // already exists cannot hand it back, so say that rather than printing an
    // empty line the operator would paste.
    console.log('          Its signing secret cannot be re-read. Roll it in the dashboard if you have lost it.');
    return null;
  }

  const created = await stripe.webhookEndpoints.create({
    url,
    enabled_events: EVENTS,
    description: 'Pricebird subscription state',
  });
  console.log(`webhook   ${created.id} (created, pointing at ${url})`);
  return created.secret ?? null;
}

async function main(): Promise<void> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error('STRIPE_SECRET_KEY is not set. Put it in .env.local first.');
    process.exit(1);
  }

  const mode = key.startsWith('sk_live') ? 'LIVE' : 'test';
  console.log(`\nStripe (${mode} mode)\n`);

  const stripe = new Stripe(key);
  const product = await findOrCreateProduct(stripe);
  const monthly = await findOrCreatePrice(stripe, product, 'monthly', MONTHLY_CENTS, 'month');
  const yearly = await findOrCreatePrice(stripe, product, 'yearly', YEARLY_CENTS, 'year');

  let webhookSecret: string | null = null;
  if (process.argv.includes('--webhook')) {
    const appUrl = process.env.APP_URL;
    if (!appUrl) {
      console.error('\n--webhook needs APP_URL, and it must be the deployed URL, not localhost.');
      process.exit(1);
    }
    if (appUrl.includes('localhost')) {
      console.error('\nAPP_URL is localhost. Stripe cannot reach that - use `stripe listen` for local work.');
      process.exit(1);
    }
    webhookSecret = await setUpWebhook(stripe, appUrl);
  }

  console.log('\nPaste these into Vercel (or .env.local):\n');
  console.log(`STRIPE_PRICE_MONTHLY=${monthly.id}`);
  console.log(`STRIPE_PRICE_YEARLY=${yearly.id}`);
  if (webhookSecret) console.log(`STRIPE_WEBHOOK_SECRET=${webhookSecret}`);
  console.log('\nThis is the only time the webhook secret is shown. Do not commit it.\n');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
