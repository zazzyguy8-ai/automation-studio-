/**
 * Is this deployment actually able to take money?
 *
 * Every check here corresponds to a way the app looks fine and quietly does
 * not work: a Stripe key set but no webhook registered, so customers are
 * charged and stay on the free plan; a database URL that connects but has no
 * tables; a Resend key with no verified sender, so nobody can ever sign in on
 * a second device. None of these show up on the landing page.
 *
 *   npm run doctor                 # against .env.local
 *   vercel env pull .env.local     # then the same command, against production
 */
import Stripe from 'stripe';
import Anthropic from '@anthropic-ai/sdk';
import { Client } from 'pg';
import { requireModel } from '../src/lib/models';
import { PRICE_ENV } from '../src/lib/billing/plans';

type Level = 'blocking' | 'warning';

interface Result {
  name: string;
  ok: boolean;
  level: Level;
  detail: string;
}

const results: Result[] = [];

function record(name: string, ok: boolean, detail: string, level: Level = 'blocking'): void {
  results.push({ name, ok, level, detail });
}

async function checkModel(): Promise<void> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    record('Claude key', false, 'ANTHROPIC_API_KEY is not set - no listing can be written at all.');
    return;
  }

  let model: string;
  try {
    model = requireModel();
  } catch (error) {
    record('Claude model', false, error instanceof Error ? error.message : 'VISION_MODEL is unusable.');
    return;
  }

  try {
    const client = new Anthropic({ apiKey: key });
    const models = await client.models.list({ limit: 50 });
    const available = models.data.some((m) => m.id === model || m.id.startsWith(model));
    record('Claude key', true, `valid, listing on ${model}`);
    if (!available) {
      record(
        'Claude model',
        false,
        `${model} is not in the list this key can reach. It would 404 on the first upload.`,
      );
    }
  } catch (error) {
    record('Claude key', false, `the key was rejected: ${error instanceof Error ? error.message : error}`);
  }
}

async function checkDatabase(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    record(
      'Database',
      false,
      'DATABASE_URL is not set. The app falls back to a JSON file, which on a serverless host '
      + 'means every account disappears when the instance recycles.',
    );
    return;
  }

  const client = new Client({
    connectionString: url,
    ssl: url.includes('localhost') ? undefined : { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    const { rows } = await client.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_name in ('accounts', 'listings', 'login_codes')`,
    );
    const found = rows.map((r) => r.table_name);
    const missing = ['accounts', 'listings', 'login_codes'].filter((t) => !found.includes(t));

    if (missing.length > 0) {
      record('Database', false, `connected, but ${missing.join(', ')} missing. Run: npm run db:push`);
    } else {
      const [{ count }] = (await client.query<{ count: string }>('select count(*)::text from accounts')).rows;
      record('Database', true, `connected, schema present, ${count} accounts`);
    }
  } catch (error) {
    record('Database', false, `could not connect: ${error instanceof Error ? error.message : error}`);
  } finally {
    await client.end().catch(() => {});
  }
}

async function checkStripe(): Promise<void> {
  const key = process.env.STRIPE_SECRET_KEY;
  const appUrl = process.env.APP_URL;

  if (!key) {
    record('Stripe key', false, 'STRIPE_SECRET_KEY is not set - nothing can be sold.');
    return;
  }

  const live = key.startsWith('sk_live');
  const stripe = new Stripe(key);
  record('Stripe key', true, live ? 'LIVE mode' : 'test mode - real cards will be declined', live ? 'blocking' : 'warning');

  for (const [interval, env] of Object.entries(PRICE_ENV)) {
    const id = process.env[env];
    if (!id) {
      record(
        `Price (${interval})`,
        false,
        interval === 'yearly'
          ? `${env} is not set, so only the monthly plan is on sale. That is a fine way to launch.`
          : `${env} is not set. Nothing can be sold. Run: npm run setup:stripe`,
        interval === 'yearly' ? 'warning' : 'blocking',
      );
      continue;
    }
    try {
      const price = await stripe.prices.retrieve(id);
      if (!price.recurring) {
        record(`Price (${interval})`, false, `${id} is a one-off price, not a subscription.`);
      } else if (!price.active) {
        record(`Price (${interval})`, false, `${id} is archived in Stripe; checkout would fail.`);
      } else {
        const amount = ((price.unit_amount ?? 0) / 100).toFixed(2);
        record(`Price (${interval})`, true, `${price.currency.toUpperCase()} ${amount} / ${price.recurring.interval}`);
      }
    } catch {
      record(`Price (${interval})`, false, `${id} does not exist in this Stripe mode. Test-mode ids do not work live.`);
    }
  }

  // The check that actually decides whether money turns into access.
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    record(
      'Webhook secret',
      false,
      'STRIPE_WEBHOOK_SECRET is not set. Customers would be charged and stay on the free plan, '
      + 'because nothing but a verified webhook may upgrade an account.',
    );
  } else {
    record('Webhook secret', true, 'set');
  }

  if (!appUrl) {
    record('Webhook endpoint', false, 'APP_URL is not set, so the endpoint URL cannot be checked.');
    return;
  }

  const expected = `${appUrl.replace(/\/$/, '')}/api/billing/webhook`;
  try {
    const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
    const endpoint = endpoints.data.find((e) => e.url === expected);
    if (!endpoint) {
      record('Webhook endpoint', false, `no Stripe endpoint points at ${expected}. Run: npm run setup:stripe -- --webhook`);
    } else if (endpoint.status !== 'enabled') {
      record('Webhook endpoint', false, `the endpoint at ${expected} is ${endpoint.status}.`);
    } else {
      const needed = ['checkout.session.completed', 'customer.subscription.updated', 'customer.subscription.deleted'];
      const missing = needed.filter((e) => !endpoint.enabled_events.includes(e) && !endpoint.enabled_events.includes('*'));
      if (missing.length > 0) {
        record('Webhook endpoint', false, `registered, but not listening for: ${missing.join(', ')}`);
      } else {
        record('Webhook endpoint', true, `enabled at ${expected}`);
      }
    }
  } catch (error) {
    record('Webhook endpoint', false, `could not be listed: ${error instanceof Error ? error.message : error}`);
  }
}

async function checkMail(): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;

  if (!key || !from) {
    record(
      'Email',
      false,
      'RESEND_API_KEY or MAIL_FROM is missing. Sign-in codes are refused in production, so anyone '
      + 'who clears their cookies loses their account.',
    );
    return;
  }

  try {
    const response = await fetch('https://api.resend.com/domains', { headers: { authorization: `Bearer ${key}` } });
    if (!response.ok) {
      record('Email', false, `Resend rejected the key (${response.status}).`);
      return;
    }

    const payload = (await response.json()) as { data?: Array<{ name: string; status: string }> };
    const domain = from.split('@').pop()?.replace(/>$/, '').trim() ?? '';
    const verified = (payload.data ?? []).find((d) => d.name === domain);

    if (!verified) {
      record('Email', false, `${domain} is not a domain on this Resend account, so the send would be refused.`);
    } else if (verified.status !== 'verified') {
      record('Email', false, `${domain} is "${verified.status}" in Resend, not verified. DNS is not finished.`);
    } else {
      record('Email', true, `sending as ${from}`);
    }
  } catch (error) {
    record('Email', false, `Resend could not be reached: ${error instanceof Error ? error.message : error}`);
  }
}

function checkSecrets(): void {
  const secret = process.env.SESSION_SECRET ?? '';
  if (secret.length < 32) {
    record('Session secret', false, 'SESSION_SECRET is missing or under 32 characters. Generate: openssl rand -hex 32');
  } else {
    record('Session secret', true, `${secret.length} characters`);
  }

  const appUrl = process.env.APP_URL ?? '';
  if (!appUrl) {
    record('App URL', false, 'APP_URL is not set - checkout has nowhere to return the customer to.');
  } else if (appUrl.includes('localhost')) {
    record('App URL', false, `APP_URL is ${appUrl}. In production that sends paying customers to their own machine.`, 'warning');
  } else if (!appUrl.startsWith('https://')) {
    record('App URL', false, `APP_URL is ${appUrl}. Session cookies are secure-only in production and will not be sent over http.`);
  } else {
    record('App URL', true, appUrl);
  }
}

async function main(): Promise<void> {
  console.log('\nPricebird preflight\n');

  checkSecrets();
  await checkModel();
  await checkDatabase();
  await checkStripe();
  await checkMail();

  const width = Math.max(...results.map((r) => r.name.length));
  for (const result of results) {
    const mark = result.ok ? '  ok  ' : result.level === 'warning' ? ' warn ' : ' FAIL ';
    console.log(`[${mark}] ${result.name.padEnd(width)}  ${result.detail}`);
  }

  const blocking = results.filter((r) => !r.ok && r.level === 'blocking');
  const warnings = results.filter((r) => !r.ok && r.level === 'warning');

  console.log('');
  if (blocking.length === 0) {
    console.log(
      warnings.length === 0
        ? 'Ready. This deployment can take money and deliver listings.\n'
        : `Ready, with ${warnings.length} thing${warnings.length === 1 ? '' : 's'} to know about above.\n`,
    );
    return;
  }

  console.log(`${blocking.length} blocking problem${blocking.length === 1 ? '' : 's'}. Fix those before you send anyone to the site.\n`);
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
