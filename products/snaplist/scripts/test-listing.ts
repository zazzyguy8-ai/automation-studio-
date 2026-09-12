/**
 * Offline tests for the part that costs money when it is wrong.
 *
 * No key, no network: a stub transport stands in for the API, so these run in
 * CI and on a laptop with an empty .env. What they check is the wiring and the
 * refusals - that a photo actually reaches the model as an image block, that a
 * truncated response is reported as a budget problem rather than a schema one,
 * and that no platform limit is ever trusted to the prompt.
 */
import assert from 'node:assert/strict';
import { generateListing } from '../src/lib/listing/generate';
import { fitTitle, PLATFORM_SPECS } from '../src/lib/listing/platforms';
import { renderFor, ListingSchema, type Listing } from '../src/lib/listing/schema';

const GOOD_LISTING: Listing = {
  item: {
    what: "men's canvas work jacket",
    brand: 'Carhartt',
    brand_confidence: 'visible',
    model: 'Detroit',
    colour: 'brown',
    material: 'cotton duck canvas',
    size_on_label: 'L',
    condition: 'good',
    condition_evidence: ['fading at the cuffs', 'paint mark on the left sleeve'],
    flaws: ['small paint mark on left sleeve'],
    features: ['corduroy collar', 'blanket lining'],
    era_or_style: '90s workwear',
  },
  title: 'Carhartt Detroit Jacket Brown Canvas Mens L',
  description: 'Carhartt Detroit jacket in brown duck canvas with a corduroy collar. Worn, with fading at the cuffs and a small paint mark on the left sleeve shown in the photos.',
  bullets: ['Corduroy collar', 'Blanket lined'],
  keywords: ['carhartt', 'detroit jacket', 'workwear', 'duck canvas'],
  platforms: [
    { platform: 'ebay', title: 'Carhartt WIP Detroit Jacket Brown Duck Canvas Corduroy Collar Mens Size L', hashtags: [] },
    { platform: 'depop', title: 'Vintage Carhartt Detroit jacket brown workwear L', hashtags: ['carhartt', 'workwear', 'vintage', 'y2k', 'jacket', 'mens'] },
  ],
  price: {
    currency: 'GBP', low: 78, suggested: 95, high: 120,
    basis: 'Typical resale band for a worn Detroit jacket with visible fading.',
    confidence: 'medium',
  },
  ask_the_seller: ['Pit to pit measurement'],
  photo_tips: ['Shoot the label flat'],
};

/** Builds a fake API response containing a forced tool call. */
function stubResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function toolMessage(input: unknown, stopReason = 'tool_use') {
  return {
    id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-sonnet-5',
    content: [{ type: 'tool_use', id: 'tu_1', name: 'submit_listing', input }],
    stop_reason: stopReason,
    usage: { input_tokens: 900, output_tokens: 700 },
  };
}

const PHOTO = { media_type: 'image/jpeg' as const, data: 'A'.repeat(400) };

async function wiring(): Promise<void> {
  let seen: Record<string, unknown> | null = null;

  const listing = await generateListing(
    { photos: [PHOTO], platforms: ['ebay', 'depop'], currency: 'GBP', notes: 'Bought in Berlin.' },
    {
      apiKey: 'sk-ant-test',
      fetch: async (_url, init) => {
        seen = JSON.parse(String((init as RequestInit).body));
        return stubResponse(toolMessage(GOOD_LISTING));
      },
    },
  );

  assert.ok(seen, 'the transport was never called');
  const request = seen as Record<string, any>;

  const content = request.messages[0].content as Array<Record<string, any>>;
  const image = content.find((block) => block.type === 'image');
  assert.ok(image, 'no image block reached the API - the photo was dropped somewhere');
  assert.equal(image.source.type, 'base64');
  assert.equal(image.source.media_type, 'image/jpeg');

  const prompt = content.find((block) => block.type === 'text');
  assert.ok(prompt, 'no prompt block reached the API');
  const text = prompt.text as string;
  assert.match(text, /GBP/, 'the currency never made it into the prompt');
  assert.match(text, /Bought in Berlin/, "the seller's notes were dropped");
  assert.match(text, /80 characters/, 'the eBay title limit was not stated to the model');

  assert.equal(request.tool_choice.name, 'submit_listing', 'the tool call was not forced');
  assert.equal(listing.item.brand, 'Carhartt');
  console.log('  ✓ photo, currency, notes and platform limits all reach the API');
}

async function budgetFailure(): Promise<void> {
  await assert.rejects(
    generateListing({ photos: [PHOTO], platforms: ['ebay'], currency: 'USD' }, {
      apiKey: 'sk-ant-test',
      fetch: async () => stubResponse(toolMessage({}, 'max_tokens')),
    }),
    /output budget problem/,
    'a truncated response must be reported as a budget problem, not a schema failure',
  );
  console.log('  ✓ a cut-off response names the real cause');
}

async function refusal(): Promise<void> {
  await assert.rejects(
    generateListing({ photos: [PHOTO], platforms: ['ebay'], currency: 'USD' }, {
      apiKey: 'sk-ant-test',
      fetch: async () => stubResponse({
        id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-sonnet-5',
        content: [], stop_reason: 'refusal', usage: { input_tokens: 900, output_tokens: 3 },
      }),
    }),
    /declined to describe this photo/,
    'a refusal must be explained in terms the seller can act on',
  );
  console.log('  ✓ a refusal is explained, not swallowed');
}

async function inputGuards(): Promise<void> {
  const call = (input: Parameters<typeof generateListing>[0]) =>
    generateListing(input, { apiKey: 'sk-ant-test', fetch: async () => stubResponse(toolMessage(GOOD_LISTING)) });

  await assert.rejects(call({ photos: [], platforms: ['ebay'], currency: 'USD' }), /No photo/);
  await assert.rejects(
    call({ photos: Array(5).fill(PHOTO), platforms: ['ebay'], currency: 'USD' }),
    /more than the 4/,
  );
  await assert.rejects(
    call({ photos: [{ media_type: 'image/heic' as never, data: PHOTO.data }], platforms: ['ebay'], currency: 'USD' }),
    /not a format this reads/,
  );
  await assert.rejects(
    call({ photos: [{ media_type: 'image/jpeg', data: 'A'.repeat(8 * 1024 * 1024) }], platforms: ['ebay'], currency: 'USD' }),
    /The limit is 5MB/,
  );
  console.log('  ✓ bad input is refused before an API call is paid for');
}

function schemaRejectsInvention(): void {
  // The model is allowed to say it does not know. It is not allowed to return
  // a shape the app would then render as fact.
  const withoutEvidence = { ...GOOD_LISTING, item: { ...GOOD_LISTING.item, condition_evidence: [] } };
  assert.throws(() => ListingSchema.parse(withoutEvidence), /at least 1/i,
    'a condition grade with no evidence behind it must not parse');

  const unknownSize = ListingSchema.parse({ ...GOOD_LISTING, item: { ...GOOD_LISTING.item, size_on_label: null } });
  assert.equal(unknownSize.item.size_on_label, null, 'an unreadable size must be allowed to stay empty');
  console.log('  ✓ the schema allows "unknown" and refuses an ungrounded grade');
}

function platformLimits(): void {
  const long = 'Carhartt WIP Detroit Jacket Brown Duck Canvas Corduroy Collar Blanket Lined Mens Size Large Vintage';
  const overlong: Listing = { ...GOOD_LISTING, platforms: [{ platform: 'ebay', title: long, hashtags: [] }] };

  const ebay = renderFor(overlong, 'ebay');
  assert.ok(ebay.title.length <= 80, `eBay title was ${ebay.title.length} characters`);
  assert.ok(!ebay.title.endsWith(' '), 'a trailing space would be pasted into the title field');
  assert.ok(long.startsWith(ebay.title), 'truncation must not rewrite the words');
  assert.ok(ebay.overflow, 'the seller is not being told their title was cut');

  // A word boundary, not a mid-word chop.
  assert.equal(fitTitle('Nike Air Max 90 White Leather', 18), 'Nike Air Max 90');
  assert.equal(fitTitle('Supercalifragilistic', 8), 'Supercal', 'a single over-long word still has to yield something');

  // Hashtags belong on Depop and nowhere near eBay.
  assert.equal(renderFor(GOOD_LISTING, 'ebay').hashtags.length, 0);
  const depop = renderFor(GOOD_LISTING, 'depop');
  assert.equal(depop.hashtags.length, PLATFORM_SPECS.depop.hashtags, 'Depop caps hashtags at 5');
  assert.ok(depop.hashtags.every((tag) => tag.startsWith('#')));

  // A platform the model skipped still has to produce pasteable copy.
  const missing = renderFor(GOOD_LISTING, 'mercari');
  assert.ok(missing.title.length > 0, 'a platform with no generated title must fall back, not blank');
  console.log('  ✓ every platform limit is enforced in code, not asked for in a prompt');
}

async function main(): Promise<void> {
  console.log('listing');
  await wiring();
  await budgetFailure();
  await refusal();
  await inputGuards();
  schemaRejectsInvention();
  platformLimits();
  console.log('all listing tests passed\n');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
