/**
 * URL in, automation proposal out, from the terminal.
 *
 *   npm run pipeline -- https://some-company.sk --industry "auto repair" --country SK
 *   npm run pipeline -- --fixture karoseria-hronec        # offline demo
 *
 * Same code path as the web UI. Use it when you want the proposal in front of
 * you in 30 seconds without opening a browser.
 */
import { runAudit } from '@/lib/audit/run';
import { buildDemo } from '@/lib/demo/build';
import { buildOutreachSequence } from '@/lib/outreach/build';
import { buildBlueprint } from '@/lib/blueprint/build';
import { fixtureFetcher } from '@/lib/scrape/fixture-fetcher';
import { paybackMonths } from '@/lib/estimate/model';

const FIXTURE_URLS: Record<string, { url: string; industry: string; country: string }> = {
  'karoseria-hronec': { url: 'https://karoseria-hronec.sk', industry: 'auto body repair', country: 'SK' },
  'praxis-lindner': { url: 'https://lindner-dental.at', industry: 'dental clinic', country: 'AT' },
  'novak-reality': { url: 'https://novakreality.cz', industry: 'real estate agency', country: 'CZ' },
};

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

const h1 = (s: string) => console.log(`\n\x1b[1m${s}\x1b[0m\n${'-'.repeat(s.length)}`);

async function main() {
  const fixture = arg('--fixture');
  const positional = process.argv.slice(2).find((a) => !a.startsWith('--') && /\./.test(a));

  let website = positional;
  let industry = arg('--industry') ?? null;
  let country = arg('--country') ?? null;
  let fetcher;

  if (fixture) {
    const f = FIXTURE_URLS[fixture];
    if (!f) {
      console.error(`unknown fixture "${fixture}". Options: ${Object.keys(FIXTURE_URLS).join(', ')}`);
      process.exit(1);
    }
    website = f.url;
    industry ??= f.industry;
    country ??= f.country;
    fetcher = fixtureFetcher(fixture, f.url);
  }

  if (!website) {
    console.error('usage: npm run pipeline -- <url> [--industry "..."] [--country XX]');
    console.error('   or: npm run pipeline -- --fixture karoseria-hronec');
    process.exit(1);
  }

  const buildFee = Number(arg('--build-fee') ?? 1500);
  const monthlyFee = Number(arg('--monthly-fee') ?? 300);

  // Say which brain is running before the work starts, so a missing key is
  // obvious immediately rather than after a thin-looking audit.
  const provider = process.env.REASONING_PROVIDER
    ?? (process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'heuristic');
  if (provider === 'heuristic') {
    console.log('reasoning: heuristic (no ANTHROPIC_API_KEY in env or .env.local) - audits will be thinner');
  } else {
    console.log(`reasoning: ${provider} (${process.env.AUDIT_MODEL ?? 'claude-opus-5'})`);
  }
  console.log(`Auditing ${website} …`);
  const { lead, snapshot, audit } = await runAudit({ website, industry, country, source: 'cli', fetcher });

  if (audit.status !== 'ok') {
    console.error(`\nAudit ${audit.status}. It was stored but will not be shown to a prospect.`);
    for (const g of audit.gate_report.length ? audit.gate_report : [audit.error]) console.error(`  - ${g}`);
    process.exit(1);
  }

  const result = audit.result!;
  const winner = result.opportunities.find((o) => o.id === result.recommended_opportunity_id)!;
  const problem = result.problems.find((p) => p.id === winner.problem_id)!;

  h1(`${lead.company_name}  (${lead.website})`);
  console.log(result.business_profile.what_they_do);
  console.log(`intake: ${result.business_profile.intake_channels.join(', ')}`);
  console.log(`booking: ${result.business_profile.booking_model}`);
  console.log(`pages read: ${snapshot.pages.length} · model: ${audit.model}`);

  h1('THIS IS THEIR PROBLEM');
  console.log(problem.title);
  console.log(problem.description);
  for (const e of problem.evidence) console.log(`  evidence: "${e.quote}"\n            ${e.url}`);
  console.log(`\nwhy it costs money (hypothesis): ${problem.revenue_leak_hypothesis}`);

  h1('THIS IS WHAT WE AUTOMATE');
  console.log(`${winner.title}   [template: ${winner.template_key}]`);
  for (const [i, s] of winner.workflow_steps.entries()) {
    const meta = [s.channel, s.integration, s.sla].filter(Boolean).join(' · ');
    console.log(`  ${i + 1}. [${s.actor}] ${s.action}${meta ? `\n        ${meta}` : ''}`);
  }

  h1('THESE ARE THE INTEGRATIONS');
  for (const i of winner.integrations) console.log(`  - ${i}`);

  h1('OPTIONS WE SCORED AND REJECTED');
  for (const o of result.opportunities.slice(1)) {
    console.log(`  [${o.total_score}] ${o.title} — roi ${o.roi.score} / effort ${o.effort.score} / urgency ${o.urgency.score}`);
  }
  console.log(`\nwhy the winner: ${result.recommendation_rationale}`);

  const demo = await buildDemo(lead, audit);

  h1('THIS IS THE ROI (ALL ESTIMATES, NOT MEASUREMENTS)');
  for (const e of demo.impact) {
    console.log(`  ~ ${e.label}: ${e.low}–${e.high} ${e.unit}  [${e.confidence}]`);
    console.log(`      ${e.assumptions[1] ?? e.assumptions[0]}`);
  }
  const payback = paybackMonths(demo.impact, buildFee, monthlyFee);
  console.log(`  ~ ${payback.label}: ${payback.low}–${payback.high} at EUR ${buildFee} build + EUR ${monthlyFee}/mo`);

  h1('THIS IS THE DEMO SCRIPT');
  console.log(demo.headline);
  console.log('\nBEFORE:');
  for (const b of demo.before) console.log(`  - ${b}`);
  console.log('AFTER:');
  for (const a of demo.after) console.log(`  - ${a}`);
  console.log('');
  for (const s of demo.scenes) console.log(`  ${s.t}  [${s.on_screen}]\n     "${s.narration}"`);

  const emails = await buildOutreachSequence(lead, audit, demo, 'email', 2);

  h1('THIS IS WHAT WE SEND THEM (draft - approve in the UI before sending)');
  console.log(`Subject: ${emails[0].subject}\n`);
  console.log(emails[0].body);

  const blueprint = buildBlueprint(winner.template_key, {
    client: {
      id: 'preview', lead_id: lead.id, name: lead.company_name, country: lead.country,
      build_fee_eur: buildFee, monthly_fee_eur: monthlyFee, stripe_customer_id: null,
      created_at: new Date().toISOString(),
    },
    audit: result,
  });

  h1('IF THEY BUY, THIS IS THE BUILD');
  console.log(`${blueprint.steps.length} steps · ${blueprint.deployment_checklist.length} checklist items`);
  console.log('credentials needed (names only — values go in the secret store):');
  for (const c of blueprint.credentials.filter((x) => x.required)) console.log(`  - ${c.env_var}  (${c.provider})`);
  console.log(`handoff: ${blueprint.human_handoff.route_to} — ${blueprint.human_handoff.sla}`);

  console.log(`\nOpen the full record: /leads/${lead.id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
