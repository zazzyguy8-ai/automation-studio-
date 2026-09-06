/**
 * Testy pre lead discovery: taxonómia, trhy, parsovanie oboch providerov,
 * overovanie kontaktov a schvaľovacia brána.
 *
 *   npm run test:discovery
 *
 * Beží offline proti fixtures. Živé volania Nominatim/Overpass/Places sa v
 * tomto prostredí overiť nedajú (sieť je blokovaná) - testuje sa parsovanie
 * a rozhodovanie, teda presne tie miesta, kde vzniká chyba.
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
  section('1. Taxonómia odvetví (globálne, viacjazyčne)');
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
  // Nemčina a severské jazyky skladajú slová - prioritné trhy to potrebujú.
  const compounds: Array<[string, string]> = [
    ['Immobilienmakler', 'real_estate'], ['Zahnarztpraxis', 'dental'],
    ['Steuerberatungskanzlei', 'accounting'], ['Rechtsanwaltskanzlei', 'law'],
    ['Fitnessstudio', 'fitness'], ['Autowerkstatt', 'auto_repair'],
  ];
  for (const [input, expected] of compounds) {
    const got = resolveIndustry(input);
    check(`zložené slovo "${input}" -> ${expected}`, got?.key === expected, got?.key ?? 'null');
  }

  check('neznáme odvetvie vráti null, nehádame', resolveIndustry('interpretive dance studio') === null);
  check('krátke slovo netrafí náhodnú kategóriu', resolveIndustry('shop') === null);
  check('prázdny vstup vráti null', resolveIndustry('   ') === null);
}

function testMarkets() {
  section('2. Trhové profily');
  check('UK, USA, DACH aj Nordics sú medzi prioritnými',
    ['GB', 'US', 'DE', 'AT', 'CH', 'SE', 'NO', 'DK', 'FI'].every(
      (c) => PRIORITY_MARKETS.some((m) => m.country === c)));
  check('Nemecko je označené ako vysokorizikové pre cold email',
    getMarket('DE').outreach_risk === 'high');
  check('Rakúsko tiež', getMarket('AT').outreach_risk === 'high');
  check('Dánsko tiež', getMarket('DK').outreach_risk === 'high');
  check('UK je nízkorizikové', getMarket('GB').outreach_risk === 'low');
  check('USA je nízkorizikové', getMarket('US').outreach_risk === 'low');
  check('USA vyžaduje fyzickú adresu v správe (CAN-SPAM)',
    getMarket('US').required_in_message.some((r) => /adres/i.test(r)));
  check('DACH dostane nemecký outreach',
    ['DE', 'AT', 'CH'].every((c) => getMarket(c).outreach_language === 'German'));
  check('neznáma krajina je konzervatívne vysokoriziková',
    getMarket('ZZ').outreach_risk === 'high');
  check('neznáma krajina si nesie zadaný kód', getMarket('ZZ').country === 'ZZ');
  check('každý trh má odhlásenie medzi povinnosťami',
    MARKETS.every((m) => m.required_in_message.some((r) => /odhlásen/i.test(r))));
  check('case-insensitive kód krajiny', getMarket('gb').country === 'GB');
}

function testWebsiteNormalisation() {
  section('3. Normalizácia webu zo zdroja');
  check('doplní schému', normalizeWebsite('quaystreetmotors.example') === 'https://quaystreetmotors.example');
  check('odreže trailing slash', normalizeWebsite('https://x.example/') === 'https://x.example');
  check('vezme prvý z viacerých', normalizeWebsite('https://a.example; https://b.example') === 'https://a.example');
  check('sociálna sieť NIE je firemný web',
    normalizeWebsite('https://www.facebook.com/salfordtyres') === null);
  check('LinkedIn tiež nie', normalizeWebsite('https://linkedin.com/company/x') === null);
  check('nezmysel vráti null', normalizeWebsite('nonsense') === null);
  check('prázdno vráti null', normalizeWebsite(undefined) === null);
}

async function testOverpass() {
  section('4. Overpass provider (OpenStreetMap)');
  const provider = new OverpassProvider({ fetch: fixtureSearchFetch() });
  const out = await provider.search({ industry: 'car repair', country: 'GB', city: 'Manchester', limit: 10 });

  check('provider je vždy dostupný (bez kľúča)', provider.available());
  check('vyriešil oblasť cez Nominatim', out.query_echo.resolved_area.includes('Manchester'));
  check('našiel firmy s webom', out.companies.length >= 2, `${out.companies.length}`);
  check('firma bez webu je vynechaná, nie vymyslená',
    out.skipped.some((s) => s.name === 'Ancoats Body Shop'));
  check('firma bez názvu sa ignoruje',
    !out.companies.some((c) => !c.name));
  check('firma, ktorej "web" je Facebook, je vynechaná',
    out.skipped.some((s) => s.name === 'Salford Tyres Direct'));

  const first = out.companies[0];
  check('každá firma nesie aspoň jeden zdroj', out.companies.every((c) => c.sources.length >= 1));
  check('zdroj je overiteľná OSM URL', /openstreetmap\.org\/node\/1001/.test(first.sources[0].source_url));
  check('zdroj hovorí, ktoré polia z neho pochádzajú', first.sources[0].fields.includes('website'));
  check('kontakty z adresára sú označené from_directory',
    first.contacts.every((c) => c.verification === 'from_directory'));
  check('žiadny kontakt nie je odvodený z domény',
    !out.companies.some((c) => c.contacts.some((x) => x.kind === 'email' && x.evidence_url === null)));
  check('match_reason vysvetľuje, prečo firma vyhovuje', first.match_reason.length > 10);
  check('neznáme odvetvie provider odmietne',
    await provider.search({ industry: 'balloon animals', country: 'GB' }).then(() => false, () => true));
  return out;
}

async function testPlaces() {
  section('5. Google Places provider');
  const noKey = new GooglePlacesProvider({ apiKey: undefined, fetch: fixtureSearchFetch() });
  check('bez kľúča sa hlási ako nedostupný', !noKey.available());
  check('bez kľúča volanie zlyhá zrozumiteľne',
    await noKey.search({ industry: 'car repair', country: 'GB' }).then(() => false, (e) => /GOOGLE_PLACES_API_KEY/.test(e.message)));

  const provider = new GooglePlacesProvider({ apiKey: 'test-key-not-real', fetch: fixtureSearchFetch() });
  const out = await provider.search({ industry: 'car repair', country: 'GB', city: 'Manchester' });
  check('s kľúčom je dostupný', provider.available());
  check('parsuje odpoveď Places', out.companies.length === 1, `${out.companies.length}`);
  check('firma bez webu je vynechaná', out.skipped.some((s) => s.name === 'Deansgate Service Centre'));
  check('zdroj je overiteľný Maps odkaz', /place_id:ChIJplace001/.test(out.companies[0].sources[0].source_url));
  check('Places nevracia email, tak žiadny nevzniká',
    out.companies[0].contacts.every((c) => c.kind !== 'email'));
}

async function testVerification() {
  section('6. Overenie kontaktov proti webu firmy');
  const provider = new OverpassProvider({ fetch: fixtureSearchFetch() });
  const found = await provider.search({ industry: 'car repair', country: 'GB', city: 'Manchester' });
  const northgate = found.companies.find((c) => c.name === 'Northgate Auto Repairs')!;

  const verified = await verifyCompany(northgate, { fetcher: fixtureSiteFetcher() });
  check('web je dosiahnuteľný', verified.verification.website_reachable);
  check('prečítal viac stránok', verified.verification.pages_read >= 2, `${verified.verification.pages_read}`);
  check('názov firmy potvrdený na jej webe', verified.verification.name_matches_site);

  const email = verified.contacts.find((c) => c.kind === 'email');
  check('email nájdený priamo na webe', email?.verification === 'found_on_site', email?.verification);
  check('email nesie URL, kde stojí', Boolean(email?.evidence_url), email?.evidence_url ?? 'null');
  check('email je ten reálny z webu', email?.value === 'bookings@northgate-auto.example', email?.value);
  check('žiadny vymyslený info@ / contact@ tvar',
    !verified.contacts.some((c) => c.kind === 'email' && /^(info|contact|hello|sales)@/.test(c.value)));

  const phone = verified.contacts.find((c) => c.kind === 'phone' && c.verification === 'found_on_site');
  check('telefón z adresára povýšený, lebo sedí s webom', Boolean(phone), phone?.value ?? 'žiadny');
  check('kontaktný formulár zachytený', verified.contacts.some((c) => c.kind === 'form'));
  check('pribudol zdroj typu website', verified.sources.some((s) => s.provider === 'website'));
  check('contactableBy uprednostní dôkaz z webu',
    contactableBy(verified, 'email')?.verification === 'found_on_site');

  // Firma, ktorej web nejde načítať, sa nezahodí, ale ani nepustí do auditu.
  const dead = found.companies.find((c) => c.name === 'Quay Street Motors')!;
  const deadVerified = await verifyCompany(dead, { fetcher: fixtureSiteFetcher() });
  check('nedostupný web je poctivo zaznamenaný', !deadVerified.verification.website_reachable);
  check('a nesie dôvod', Boolean(deadVerified.verification.website_error));
}

async function testDiscoveryRun() {
  section('7. Celý discovery beh -> CRM');
  const run = await runDiscovery(
    { industry: 'car repair', country: 'GB', city: 'Manchester', limit: 10, requireWebsite: true },
    { provider: 'overpass', searchFetch: fixtureSearchFetch(), siteFetcher: fixtureSiteFetcher() },
  );

  check('beh sa dokončil', run.summary.found > 0);
  check('trh rozpoznaný ako UK', run.market.country === 'GB');
  check('aspoň jedna firma je pripravená na audit', run.summary.ready_for_audit >= 1);
  check('uloží sa len to, čo prešlo overením',
    run.summary.saved === run.results.filter((r) => r.lead).length);
  check('firmy s nedostupným webom sa neuložia',
    run.results.filter((r) => !r.company.verification.website_reachable).every((r) => r.lead === null));
  check('raw_query je uložený pre reprodukovateľnosť', run.raw_query.includes('shop'));

  const store = await getStore();
  const saved = run.results.find((r) => r.lead)!;
  const lead = await store.getLead(saved.lead!.id);
  check('lead je v CRM v stave new', lead?.stage === 'new');
  check('lead nesie zdroj discovery', lead?.source.startsWith('discovery:') === true, lead?.source);
  check('poznámka obsahuje overiteľnú zdrojovú URL',
    lead?.notes?.includes('openstreetmap.org') === true);
  check('do CRM sa uložili len kontakty s dôkazom',
    (lead?.contacts.length ?? 0) > 0 && lead!.contacts.every((c) => c.label !== 'unverified'));
  check('kontakty nesú URL dôkazu', lead!.contacts.every((c) => Boolean(c.source_url)));

  // Opakovaný beh nesmie duplikovať.
  const before = (await store.listLeads()).length;
  await runDiscovery(
    { industry: 'car repair', country: 'GB', city: 'Manchester', limit: 10, requireWebsite: true },
    { provider: 'overpass', searchFetch: fixtureSearchFetch(), siteFetcher: fixtureSiteFetcher() },
  );
  check('opakovaný beh neduplikuje leady', (await store.listLeads()).length === before);

  check('neznáme odvetvie beh odmietne',
    await runDiscovery({ industry: 'balloon animals', country: 'GB' }, { provider: 'overpass' })
      .then(() => false, (e) => /nepoznám/.test(e.message)));
  check('chýbajúca krajina beh odmietne',
    await runDiscovery({ industry: 'car repair', country: '' }, { provider: 'overpass' })
      .then(() => false, (e) => /Krajina/.test(e.message)));

  return saved.lead!.id;
}

async function testApprovalGate(leadId: string) {
  section('8. Povinné manuálne schválenie');
  const store = await getStore();
  const lead = (await store.getLead(leadId))!;

  const draft = await store.insertOutreach({
    lead_id: leadId, audit_id: 'audit-placeholder', channel: 'email', step: 0,
    subject: 'Northgate Auto Repairs',
    body: 'Na northgate-auto.example píšete, že na emaily odpovedáte do 24 hodín. Ozval by som sa ohľadom toho.',
    status: 'draft', grounding: ['citát z webu'], approved_at: null, sent_at: null,
    created_at: new Date().toISOString(),
  });

  check('vygenerovaná správa je draft, nie odoslaná', draft.status === 'draft');

  const review = reviewOutreach(draft, lead);
  check('review vráti trh leadu', review.market.country === 'GB');
  check('UK draft nemá blokátory', review.blockers.length === 0, review.blockers.join(' | '));
  check('review pripomenie povinné náležitosti trhu', review.warnings.length > 0);
  check('UK nevyžaduje vedomé potvrdenie rizika', !review.requires_explicit_ack);

  const approved = await approveOutreachForLead(leadId, draft.id);
  check('schválenie posunie draft -> approved', approved.status === 'approved');
  check('schválenie nič neodoslalo', approved.sent_at === null);

  // Ten istý draft na nemeckom leade sa bez vedomého potvrdenia schváliť nedá.
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
    status: 'draft', grounding: ['Zitat von der Website'], approved_at: null, sent_at: null,
    created_at: new Date().toISOString(),
  });

  const deReview = reviewOutreach(deDraft, deLead);
  check('nemecký lead je označený ako vysokorizikový', deReview.requires_explicit_ack);
  check('varovanie vysvetľuje prečo (UWG)', deReview.warnings.some((w) => /UWG/.test(w)));

  let refused = false;
  try {
    await approveOutreachForLead(deLead.id, deDraft.id);
  } catch (err) {
    refused = err instanceof Error && /vysokorizikov/.test(err.message);
  }
  check('schválenie pre DE bez vedomého potvrdenia je ODMIETNUTÉ', refused);

  const ackd = await approveOutreachForLead(deLead.id, deDraft.id, { acknowledgeMarketRisk: true });
  check('s vedomým potvrdením prejde', ackd.status === 'approved');

  // Neuzemnená správa musí padnúť aj s potvrdením rizika.
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
  check('generická neuzemnená správa je odmietnutá aj s potvrdením rizika', spamRefused);

  const all: OutreachMessage[] = await store.listOutreach(leadId);
  check('nič sa nikdy neoznačilo ako odoslané samo', all.every((m) => m.sent_at === null));
}

/* ------------------------------------------------------------------ */

async function main() {
  await rm(DATA_FILE, { force: true });
  console.log('Discovery testy (offline fixtures, izolovaný dátový súbor)');

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
