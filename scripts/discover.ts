/**
 * Odvetvie + krajina/mesto -> overené firmy -> leady v CRM.
 *
 *   npm run discover -- --industry "car repair" --country GB --city Manchester
 *   npm run discover -- --industry autoservis --country DE --city Munich --limit 10
 *   npm run discover -- --industry "car repair" --country GB --city Manchester --offline
 *
 * Nič sa neodosiela. Discovery iba naplní pipeline v stave `new`; audit spustíš
 * potom cez `npm run pipeline -- <url>` alebo z UI.
 */
import { runDiscovery } from '@/lib/discovery/run';
import { fixtureSearchFetch, fixtureSiteFetcher } from '@/lib/discovery/fixture-transport';
import { industryOptions } from '@/lib/discovery/taxonomy';
import { MARKETS, PRIORITY_MARKETS } from '@/lib/discovery/markets';

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  const v = i === -1 ? undefined : process.argv[i + 1];
  return v && !v.startsWith('--') ? v : undefined;
}
const has = (flag: string) => process.argv.includes(flag);

const h1 = (s: string) => console.log(`\n\x1b[1m${s}\x1b[0m\n${'-'.repeat(s.length)}`);

const USAGE = [
  'usage: npm run discover -- --industry "<odvetvie>" --country <ISO> [--city <mesto>]',
  '',
  '  --industry <text>   napr. "car repair", "Zahnarzt", "autoservis", "roofing"',
  '  --country <ISO>     napr. GB, US, DE, AT, CH, SE, NO, DK, FI',
  '  --city <mesto>      nepovinné, ale výrazne presnejšie',
  '  --limit <n>         koľko firiem najviac (default 15)',
  '  --provider <name>   auto | overpass | google_places (default auto)',
  '  --no-verify         preskočiť načítanie webov (rýchlejšie, bez dôkazov)',
  '  --offline           použiť zabudované fixtures namiesto siete',
  '',
  `odvetvia: ${industryOptions().map((i) => i.label).join(', ')}`,
  `prioritné trhy: ${PRIORITY_MARKETS.map((m) => m.country).join(', ')}`,
  `všetky zmapované: ${MARKETS.map((m) => m.country).join(', ')}`,
].join('\n');

async function main() {
  const industry = arg('--industry');
  const country = arg('--country');
  if (!industry || !country) {
    console.error(USAGE);
    process.exit(2);
  }

  const offline = has('--offline');
  const provider = (arg('--provider') ?? 'auto') as 'auto' | 'overpass' | 'google_places';

  console.log(offline
    ? 'zdroj: zabudované fixtures (--offline)'
    : `zdroj: ${provider === 'auto' ? (process.env.GOOGLE_PLACES_API_KEY ? 'google_places' : 'overpass (OpenStreetMap)') : provider}`);

  const run = await runDiscovery(
    {
      industry,
      country,
      city: arg('--city') ?? null,
      limit: Number(arg('--limit') ?? 15),
      requireWebsite: true,
    },
    {
      provider,
      verify: !has('--no-verify'),
      ...(offline ? { searchFetch: fixtureSearchFetch(), siteFetcher: fixtureSiteFetcher() } : {}),
    },
  );

  h1(`${run.summary.found} firiem · ${run.resolved_area}`);
  console.log(`provider: ${run.provider}`);
  console.log(`trh: ${run.market.name} · jazyk outreachu: ${run.market.outreach_language}`);
  console.log(`outreach riziko: ${run.market.outreach_risk.toUpperCase()}`);
  console.log(`  ${run.market.outreach_note}`);

  h1('ULOŽENÉ DO CRM');
  for (const r of run.results.filter((x) => x.lead)) {
    const verified = r.company.contacts.filter((c) => c.verification === 'found_on_site');
    console.log(`\n  ${r.company.name}`);
    console.log(`    web:      ${r.company.website}`);
    console.log(`    zdroj:    ${r.company.sources[0].source_url}`);
    console.log(`    názov overený na webe: ${r.company.verification.name_matches_site ? 'áno' : 'NIE - over ručne'}`);
    console.log(`    kontakty potvrdené na webe: ${verified.length
      ? verified.map((c) => `${c.kind}:${c.value}`).join(', ')
      : 'žiadne'}`);
    const dir = r.company.contacts.filter((c) => c.verification === 'from_directory');
    if (dir.length) console.log(`    len z adresára (slabší dôkaz): ${dir.map((c) => `${c.kind}:${c.value}`).join(', ')}`);
    console.log(`    audit: npm run pipeline -- ${r.company.website} --industry "${industry}" --country ${run.market.country}`);
  }

  const rejected = run.results.filter((x) => !x.lead);
  if (rejected.length > 0) {
    h1('VYNECHANÉ');
    for (const r of rejected) console.log(`  ${r.company.name} — ${r.rejected_reason}`);
  }
  if (run.skipped.length > 0) {
    for (const s of run.skipped) console.log(`  ${s.name} — ${s.reason}`);
  }

  h1('SÚHRN');
  console.log(`  nájdené:            ${run.summary.found}`);
  console.log(`  web dostupný:       ${run.summary.verified}`);
  console.log(`  pripravené na audit:${run.summary.ready_for_audit}`);
  console.log(`  uložené ako lead:   ${run.summary.saved}`);
  console.log('\nNič sa neodoslalo. Discovery iba plní pipeline v stave `new`.');
}

main().catch((err) => {
  console.error(`\n${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
