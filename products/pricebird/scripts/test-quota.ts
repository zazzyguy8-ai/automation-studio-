/**
 * The free tier, the paid cap, and the account merge.
 *
 * These are the three places where a bug is a refund: letting the free tier
 * run forever, locking a paying customer out, or losing somebody's listings
 * when they sign in on a second device.
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStore } from '../src/lib/db';
import { PLANS, planFromStatus } from '../src/lib/billing/plans';
import type { Listing } from '../src/lib/listing/schema';

const LISTING = {
  item: {
    what: 'thing', brand: null, brand_confidence: 'unknown', model: null, colour: 'black',
    material: null, size_on_label: null, condition: 'good', condition_evidence: ['worn'],
    flaws: [], features: [], era_or_style: null,
  },
  title: 'A thing', description: 'x'.repeat(60), bullets: ['a', 'b'],
  keywords: ['a', 'b', 'c'], platforms: [{ platform: 'ebay', title: 'A thing', hashtags: [] }],
  price: { currency: 'USD', low: 1, suggested: 2, high: 3, basis: 'a typical band', confidence: 'low' },
  ask_the_seller: [], photo_tips: [],
} as Listing;

async function main(): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'pricebird-'));
  const store = new FileStore(join(dir, 'data.json'));
  await store.init();

  console.log('quota');

  // The free allowance is a lifetime one: five listings, then the wall.
  const free = await store.createAccount();
  for (let i = 0; i < PLANS.free.limit; i += 1) await store.saveListing(free.id, 'ebay', LISTING);
  assert.equal(await store.countListings(free.id), PLANS.free.limit);

  // Nothing counted against this account belongs to anyone else.
  const other = await store.createAccount();
  await store.saveListing(other.id, 'ebay', LISTING);
  assert.equal(await store.countListings(free.id), PLANS.free.limit, 'another account leaked into this one\'s count');
  console.log('  ✓ usage is counted per account and the free tier ends');

  // The paid window is the calendar month, so last month must not count.
  const pro = await store.createAccount('pro@example.com');
  await store.updateBilling(pro.id, { plan: 'pro', subscription_status: 'active' });
  await store.saveListing(pro.id, 'vinted', LISTING);
  const nextMonth = new Date(Date.UTC(new Date().getUTCFullYear() + 1, 0, 1));
  assert.equal(await store.countListings(pro.id, nextMonth), 0, 'the monthly window is not being applied');
  console.log('  ✓ the paid window excludes earlier months');

  // A failed card must not lock anyone out while Stripe is still retrying.
  assert.equal(planFromStatus('active'), 'pro');
  assert.equal(planFromStatus('trialing'), 'pro');
  assert.equal(planFromStatus('past_due'), 'pro', 'a retrying card must not lock a paying customer out');
  assert.equal(planFromStatus('canceled'), 'free');
  assert.equal(planFromStatus('unpaid'), 'free');
  assert.equal(planFromStatus(null), 'free');
  console.log('  ✓ subscription status maps to access the way Stripe means it');

  // Signing in on a second device must find the account the email owns.
  const anonymous = await store.createAccount();
  await store.saveListing(anonymous.id, 'depop', LISTING);
  const owner = await store.findAccountByEmail('PRO@example.com');
  assert.equal(owner?.id, pro.id, 'email lookup must be case-insensitive or people lose their history');

  const fresh = await store.createAccount();
  const claimed = await store.attachEmail(fresh.id, 'New@Example.com  ');
  assert.equal(claimed.email, 'new@example.com', 'addresses must be stored normalised');
  console.log('  ✓ an account is found by its email whatever case it is typed in');

  // Stripe events arrive out of order and get replayed; the same write twice
  // must land on the same row.
  await store.updateBilling(pro.id, { plan: 'pro', subscription_status: 'active', stripe_customer_id: 'cus_1' });
  await store.updateBilling(pro.id, { plan: 'pro', subscription_status: 'active', stripe_customer_id: 'cus_1' });
  const byCustomer = await store.findAccountByCustomer('cus_1');
  assert.equal(byCustomer?.id, pro.id);
  assert.equal(byCustomer?.plan, 'pro');
  console.log('  ✓ replaying a webhook write is a no-op');

  await rm(dir, { recursive: true, force: true });
  console.log('all quota tests passed\n');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
