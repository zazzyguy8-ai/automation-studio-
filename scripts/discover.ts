/**
 * Industry + country/city -> verified companies -> leads in the CRM.
 *
 *   npm run discover -- --industry "car repair" --country GB --city Manchester
 *   npm run discover -- --industry Zahnarzt --country DE --city Munich --limit 10
 *   npm run discover -- --industry "car repair" --country GB --city Manchester --offline
 *
 * Nothing is sent. Discovery only fills the pipeline at stage `new`; run the
 * audit afterwards with `npm run pipeline -- <url>` or from the UI.
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
  'usage: npm run discover -- --industry "<industry>" --country <ISO> [--city <city>]',
  '',
  '  --industry <text>   e.g. "car repair", "Zahnarzt", "autoservis", "roofing"',
  '  --country <ISO>     e.g. GB, US, DE, AT, CH, SE, NO, DK, FI',
  '  --city <city>       optional, but markedly more precise',
  '  --limit <n>         how many companies at most (default 15)',
  '  --provider <name>   auto | overpass | google_places (default auto)',
  '  --no-verify         skip reading the websites (faster, but no evidence)',
  '  --offline           use the bundled fixtures instead of the network',
  '',
  `industries: ${industryOptions().map((i) => i.label).join(', ')}`,
  `priority markets: ${PRIORITY_MARKETS.map((m) => m.country).join(', ')}`,
  `all mapped: ${MARKETS.map((m) => m.country).join(', ')}`,
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
    ? 'source: bundled fixtures (--offline)'
    : `source: ${provider === 'auto' ? (process.env.GOOGLE_PLACES_API_KEY ? 'google_places' : 'overpass (OpenStreetMap)') : provider}`);

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

  h1(`${run.summary.found} companies · ${run.resolved_area}`);
  console.log(`provider: ${run.provider}`);
  console.log(`market: ${run.market.name} · outreach language: ${run.market.outreach_language}`);
  console.log(`outreach risk: ${run.market.outreach_risk.toUpperCase()}`);
  console.log(`  ${run.market.outreach_note}`);

  h1('SAVED TO CRM');
  for (const r of run.results.filter((x) => x.lead)) {
    const verified = r.company.contacts.filter((c) => c.verification === 'found_on_site');
    console.log(`\n  ${r.company.name}`);
    console.log(`    site:     ${r.company.website}`);
    console.log(`    source:   ${r.company.sources[0].source_url}`);
    console.log(`    name confirmed on site: ${r.company.verification.name_matches_site ? 'yes' : 'NO - check by hand'}`);
    console.log(`    contacts confirmed on site: ${verified.length
      ? verified.map((c) => `${c.kind}:${c.value}`).join(', ')
      : 'none'}`);
    const dir = r.company.contacts.filter((c) => c.verification === 'from_directory');
    if (dir.length) console.log(`    directory only (weaker evidence): ${dir.map((c) => `${c.kind}:${c.value}`).join(', ')}`);
    console.log(`    audit: npm run pipeline -- ${r.company.website} --industry "${industry}" --country ${run.market.country}`);
  }

  const rejected = run.results.filter((x) => !x.lead);
  if (rejected.length > 0) {
    h1('SKIPPED');
    for (const r of rejected) console.log(`  ${r.company.name} — ${r.rejected_reason}`);
  }
  if (run.skipped.length > 0) {
    for (const s of run.skipped) console.log(`  ${s.name} — ${s.reason}`);
  }

  h1('SUMMARY');
  console.log(`  found:              ${run.summary.found}`);
  console.log(`  site reachable:     ${run.summary.verified}`);
  console.log(`  ready to audit:     ${run.summary.ready_for_audit}`);
  console.log(`  saved as lead:      ${run.summary.saved}`);
  console.log('\nNothing was sent. Discovery only fills the pipeline at stage `new`.');
}

main().catch((err) => {
  console.error(`\n${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
