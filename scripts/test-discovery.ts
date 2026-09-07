/**
 * Tests for lead discovery: taxonomy, markets, parsing for both providers,
 * contact verification and the approval gate.
 *
 *   npm run test:discovery
 *
 * Runs offline against fixtures. Live Nominatim/Overpass/Places calls cannot be
 * verified in this environment (the network is blocked) - what is tested is the
 * parsing and the decisions, which is where the bugs actually live.
 */
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import { OverpassProvider, normalizeWebsite } from '@/lib/discovery/overpass';
import { GooglePlacesProvider } from '@/lib/discovery/google-places';
import { fixtureSearchFetch, fixtureSiteFetcher } from '@/lib/discovery/fixture-transport';
import { getMarket, MARKETS, PRIORITY_MARKETS } from '@/lib/discovery/markets';
import { resolveIndustry } from '@/lib/discovery/taxonomy';
import { runDiscovery } from '@/lib/discovery/run';
import { verifyCompany, contactableBy } from '@/lib/discovery/verify';
import { approveOutreachForLead, reviewOutreach } from '@/lib/outreach/build';
import { getStore } from '@/lib/db';
import type { OutreachMessage } from '@/lib/types';

// A configured sender, because an email cannot be approved without one.
process.env.SENDER_EMAIL = 'richard@mail.test.invalid';
process.env.SENDER_NAME = 'Richard';
process.env.SENDER_COMPANY = 'Automation Studio';

const DATA_FILE = join(process.cwd(), '.data', 'test-discovery.json');
process.env.DATA_FILE = DATA_FILE;

let failures = 0;
const section = (s: string) => console.log(`\n${s}`);
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` - ${detail}` : ''}`);
};

/* ------------------------------------------------------------------ */

function testTaxonomy() {
  section('1. Industry taxonomy (global, multilingual)');
  const cases: Array<[string, string]> = [
    ['car repair', 'auto_repair'], ['autoservis', 'auto_repair'], ['Autowerkstatt', 'auto_repair'],
    ['bilverkstad', 'auto_repair'], ['KFZ', 'auto_repair'],
    ['dentist', 'dental'], ['Zahnarzt', 'dental'], ['zubár', 'dental'], ['tandläkare', 'dental'],
    ['estate agent', 'real_estate'], ['Immobilienmakler', 'real_estate'], ['realitka', 'real_estate'],
    ['roofing', 'construction'], ['Dachdecker', 'construction'], ['rørlegger', 'construction'],
    ['solicitor', 'law'], ['Rechtsanwalt', 'law'],
    ['Steuerberater', 'accounting'], ['bookkeeping', 'accounting'],
  ];
  for (const [input, expected] of cases) {
    const got = resolveIndustry(input);
    check(`"${input}" -> ${expected}`, got?.key === expected, got?.key ?? 'null');
  }
  // German and Nordic languages glue words together - the priority markets need this.
  const compounds: Array<[string, string]> = [
    ['Immobilienmakler', 'real_estate'], ['Zahnarztpraxis', 'dental'],
    ['Steuerberatungskanzlei', 'accounting'], ['Rechtsanwaltskanzlei', 'law'],
    ['Fitnessstudio', 'fitness'], ['Autowerkstatt', 'auto_repair'],
  ];
  for (const [input, expected] of compounds) {
    const got = resolveIndustry(input);
    check(`compound "${input}" -> ${expected}`, got?.key === expected, got?.key ?? 'null');
  }

  check('unknown industry returns null, we do not guess', resolveIndustry('interpretive dance studio') === null);
  check('a short word does not hit a random category', resolveIndustry('shop') === null);
  check('empty input returns null', resolveIndustry('   ') === null);
}

function testMarkets() {
  section('2. Market profiles');
  check('UK, US, DACH and Nordics are all priority markets',
    ['GB', 'US', 'DE', 'AT', 'CH', 'SE', 'NO', 'DK', 'FI'].every(
      (c) => PRIORITY_MARKETS.some((m) => m.country === c)));
  check('Germany is flagged high-risk for cold email',
    getMarket('DE').outreach_risk === 'high');
  check('Austria too', getMarket('AT').outreach_risk === 'high');
  check('Denmark too', getMarket('DK').outreach_risk === 'high');
  check('the UK is low-risk', getMarket('GB').outreach_risk === 'low');
  check('the US is low-risk', getMarket('US').outreach_risk === 'low');
  check('the US requires a physical address in the message (CAN-SPAM)',
    getMarket('US').required_in_message.some((r) => /postal address/i.test(r)));
  check('DACH gets German-language outreach',
    ['DE', 'AT', 'CH'].every((c) => getMarket(c).outreach_language === 'German'));
  check('an unmapped country is conservatively high-risk',
    getMarket('ZZ').outreach_risk === 'high');
  check('an unmapped country keeps the code it was given', getMarket('ZZ').country === 'ZZ');
  check('every market requires a working opt-out',
    MARKETS.every((m) => m.required_in_message.some((r) => /opt-out/i.test(r))));
  check('country code is case-insensitive', getMarket('gb').country === 'GB');
}

function testWebsiteNormalisation() {
  section('3. Website normalisation from the source');
  check('adds the scheme', normalizeWebsite('quaystreetmotors.example') === 'https://quaystreetmotors.example');
  check('trims the trailing slash', normalizeWebsite('https://x.example/') === 'https://x.example');
  check('takes the first of several', normalizeWebsite('https://a.example; https://b.example') === 'https://a.example');
  check('a social profile is NOT a company website',
    normalizeWebsite('https://www.facebook.com/salfordtyres') === null);
  check('nor is LinkedIn', normalizeWebsite('https://linkedin.com/company/x') === null);
  check('nonsense returns null', normalizeWebsite('nonsense') === null);
  check('empty returns null', normalizeWebsite(undefined) === null);
}

async function testOverpass() {
  section('4. Overpass provider (OpenStreetMap)');
  const provider = new OverpassProvider({ fetch: fixtureSearchFetch() });
  const out = await provider.search({ industry: 'car repair', country: 'GB', city: 'Manchester', limit: 10 });

  check('provider is always available (no key needed)', provider.available());
  check('resolved the area via Nominatim', out.query_echo.resolved_area.includes('Manchester'));
  check('found companies that have a website', out.companies.length >= 2, `${out.companies.length}`);
  check('a company with no website is skipped, not invented',
    out.skipped.some((s) => s.name === 'Ancoats Body Shop'));
  check('a nameless record is ignored',
    !out.companies.some((c) => !c.name));
  check('a company whose "website" is Facebook is skipped',
    out.skipped.some((s) => s.name === 'Salford Tyres Direct'));

  const first = out.companies[0];
  check('every company carries at least one source', out.companies.every((c) => c.sources.length >= 1));
  check('the source is a checkable OSM URL', /openstreetmap\.org\/node\/1001/.test(first.sources[0].source_url));
  check('the source states which fields came from it', first.sources[0].fields.includes('website'));
  check('directory contacts are labelled from_directory',
    first.contacts.every((c) => c.verification === 'from_directory'));
  check('no contact is derived from the domain',
    !out.companies.some((c) => c.contacts.some((x) => x.kind === 'email' && x.evidence_url === null)));
  check('match_reason explains why the company matched', first.match_reason.length > 10);
  check('the provider rejects an unknown industry',
    await provider.search({ industry: 'balloon animals', country: 'GB' }).then(() => false, () => true));
  return out;
}

async function testPlaces() {
  section('5. Google Places provider');
  const noKey = new GooglePlacesProvider({ apiKey: undefined, fetch: fixtureSearchFetch() });
  check('reports itself unavailable without a key', !noKey.available());
  check('without a key the call fails clearly',
    await noKey.search({ industry: 'car repair', country: 'GB' }).then(() => false, (e) => /GOOGLE_PLACES_API_KEY/.test(e.message)));

  const provider = new GooglePlacesProvider({ apiKey: 'test-key-not-real', fetch: fixtureSearchFetch() });
  const out = await provider.search({ industry: 'car repair', country: 'GB', city: 'Manchester' });
  check('available once a key is present', provider.available());
  check('parses the Places response', out.companies.length === 1, `${out.companies.length}`);
  check('a company with no website is skipped', out.skipped.some((s) => s.name === 'Deansgate Service Centre'));
  check('the source is a checkable Maps link', /place_id:ChIJplace001/.test(out.companies[0].sources[0].source_url));
  check('Places returns no email, so none is invented',
    out.companies[0].contacts.every((c) => c.kind !== 'email'));
}

async function testVerification() {
  section('6. Contact verification against the company site');
  const provider = new OverpassProvider({ fetch: fixtureSearchFetch() });
  const found = await provider.search({ industry: 'car repair', country: 'GB', city: 'Manchester' });
  const northgate = found.companies.find((c) => c.name === 'Northgate Auto Repairs')!;

  const verified = await verifyCompany(northgate, { fetcher: fixtureSiteFetcher() });
  check('the site is reachable', verified.verification.website_reachable);
  check('read several pages', verified.verification.pages_read >= 2, `${verified.verification.pages_read}`);
  check('company name confirmed on its own site', verified.verification.name_matches_site);

  const email = verified.contacts.find((c) => c.kind === 'email');
  check('email found directly on the site', email?.verification === 'found_on_site', email?.verification);
  check('the email carries the URL where it appears', Boolean(email?.evidence_url), email?.evidence_url ?? 'null');
  check('the email is the real one from the site', email?.value === 'bookings@northgate-auto.example', email?.value);
  check('no invented info@ / contact@ form',
    !verified.contacts.some((c) => c.kind === 'email' && /^(info|contact|hello|sales)@/.test(c.value)));

  const phone = verified.contacts.find((c) => c.kind === 'phone' && c.verification === 'found_on_site');
  check('directory phone promoted because it matches the site', Boolean(phone), phone?.value ?? 'none');
  check('contact form detected', verified.contacts.some((c) => c.kind === 'form'));
  check('a website source was added', verified.sources.some((s) => s.provider === 'website'));
  check('contactableBy prefers site evidence',
    contactableBy(verified, 'email')?.verification === 'found_on_site');

  // A company whose site cannot be read is not discarded, but not audited either.
  const dead = found.companies.find((c) => c.name === 'Quay Street Motors')!;
  const deadVerified = await verifyCompany(dead, { fetcher: fixtureSiteFetcher() });
  check('an unreachable site is recorded honestly', !deadVerified.verification.website_reachable);
  check('and carries the reason', Boolean(deadVerified.verification.website_error));
}

async function testDiscoveryRun() {
  section('7. Full discovery run -> CRM');
  const run = await runDiscovery(
    { industry: 'car repair', country: 'GB', city: 'Manchester', limit: 10, requireWebsite: true },
    { provider: 'overpass', searchFetch: fixtureSearchFetch(), siteFetcher: fixtureSiteFetcher() },
  );

  check('the run completed', run.summary.found > 0);
  check('market resolved as the UK', run.market.country === 'GB');
  check('at least one company is ready to audit', run.summary.ready_for_audit >= 1);
  check('only what passed verification is saved',
    run.summary.saved === run.results.filter((r) => r.lead).length);
  check('companies with an unreachable site are not saved',
    run.results.filter((r) => !r.company.verification.website_reachable).every((r) => r.lead === null));
  check('raw_query is kept for reproducibility', run.raw_query.includes('shop'));

  const store = await getStore();
  const saved = run.results.find((r) => r.lead)!;
  const lead = await store.getLead(saved.lead!.id);
  check('the lead is in the CRM at stage new', lead?.stage === 'new');
  check('the lead records the discovery source', lead?.source.startsWith('discovery:') === true, lead?.source);
  check('the note contains a checkable source URL',
    lead?.notes?.includes('openstreetmap.org') === true);
  check('only contacts with evidence reached the CRM',
    (lead?.contacts.length ?? 0) > 0 && lead!.contacts.every((c) => c.label !== 'unverified'));
  check('contacts carry an evidence URL', lead!.contacts.every((c) => Boolean(c.source_url)));

  // A repeat run must not duplicate.
  const before = (await store.listLeads()).length;
  await runDiscovery(
    { industry: 'car repair', country: 'GB', city: 'Manchester', limit: 10, requireWebsite: true },
    { provider: 'overpass', searchFetch: fixtureSearchFetch(), siteFetcher: fixtureSiteFetcher() },
  );
  check('a repeat run does not duplicate leads', (await store.listLeads()).length === before);

  check('the run rejects an unknown industry',
    await runDiscovery({ industry: 'balloon animals', country: 'GB' }, { provider: 'overpass' })
      .then(() => false, (e) => /Unknown industry/.test(e.message)));
  check('the run rejects a missing country',
    await runDiscovery({ industry: 'car repair', country: '' }, { provider: 'overpass' })
      .then(() => false, (e) => /Country is required/.test(e.message)));

  return saved.lead!.id;
}

async function testApprovalGate(leadId: string) {
  section('8. Mandatory manual approval');
  const store = await getStore();
  const lead = (await store.getLead(leadId))!;

  const draft = await store.insertOutreach({
    lead_id: leadId, audit_id: 'audit-placeholder', channel: 'email', step: 0,
    subject: 'Northgate Auto Repairs',
    body: 'On northgate-auto.example you say you reply to emails within 24 hours. That is what I wanted to ask about.',
    status: 'draft', grounding: ['quote from the site'], approved_at: null, sent_at: null,
    created_at: new Date().toISOString(),
  });

  check('a generated message is a draft, not sent', draft.status === 'draft');

  const review = reviewOutreach(draft, lead);
  check('review returns the lead market', review.market.country === 'GB');
  check('a UK draft has no blockers', review.blockers.length === 0, review.blockers.join(' | '));
  check('review surfaces the market requirements', review.warnings.length > 0);
  check('the UK needs no explicit risk acknowledgement', !review.requires_explicit_ack);

  const approved = await approveOutreachForLead(leadId, draft.id);
  check('approval moves draft -> approved', approved.status === 'approved');
  check('approval sent nothing', approved.sent_at === null);

  // The same draft on a German lead cannot be approved without acknowledgement.
  const deLead = await store.upsertLead({
    company_name: 'Muster Autowerkstatt', website: 'https://muster-werkstatt.example',
    industry: 'car repair', country: 'DE', size_hint: null, stage: 'new',
    contacts: [{ kind: 'email', value: 'werkstatt@muster-werkstatt.example', label: 'found_on_site' }],
    socials: [], notes: null, source: 'test',
  });
  const deDraft = await store.insertOutreach({
    lead_id: deLead.id, audit_id: 'audit-placeholder', channel: 'email', step: 0,
    subject: 'Muster Autowerkstatt',
    body: 'Auf muster-werkstatt.example steht, dass Sie innerhalb von 24 Stunden antworten.',
    status: 'draft', grounding: ['quote from the website'], approved_at: null, sent_at: null,
    created_at: new Date().toISOString(),
  });

  const deReview = reviewOutreach(deDraft, deLead);
  check('the German lead is flagged high-risk', deReview.requires_explicit_ack);
  check('the warning explains why (UWG)', deReview.warnings.some((w) => /UWG/.test(w)));

  let refused = false;
  try {
    await approveOutreachForLead(deLead.id, deDraft.id);
  } catch (err) {
    refused = err instanceof Error && /high-risk market/.test(err.message);
  }
  check('approval for DE without acknowledgement is REFUSED', refused);

  const ackd = await approveOutreachForLead(deLead.id, deDraft.id, { acknowledgeMarketRisk: true });
  check('with the acknowledgement it goes through', ackd.status === 'approved');

  // An ungrounded message must fail even with the risk acknowledged.
  const spam = await store.insertOutreach({
    lead_id: leadId, audit_id: 'audit-placeholder', channel: 'email', step: 9,
    subject: 'Quick question', body: 'Hope this email finds you well! We leverage AI to unlock efficiency.',
    status: 'draft', grounding: [], approved_at: null, sent_at: null,
    created_at: new Date().toISOString(),
  });
  let spamRefused = false;
  try {
    await approveOutreachForLead(leadId, spam.id, { acknowledgeMarketRisk: true });
  } catch {
    spamRefused = true;
  }
  check('a generic ungrounded message is refused even with the risk acknowledged', spamRefused);

  const all: OutreachMessage[] = await store.listOutreach(leadId);
  check('nothing ever marked itself as sent', all.every((m) => m.sent_at === null));
}

/* ------------------------------------------------------------------ */

async function main() {
  await rm(DATA_FILE, { force: true });
  console.log('Discovery tests (offline fixtures, isolated data file)');

  testTaxonomy();
  testMarkets();
  testWebsiteNormalisation();
  await testOverpass();
  await testPlaces();
  await testVerification();
  const leadId = await testDiscoveryRun();
  await testApprovalGate(leadId);

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  await rm(DATA_FILE, { force: true });
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
