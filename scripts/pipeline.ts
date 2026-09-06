/**
 * URL in, automation proposal out, from the terminal.
 *
 *   npm run pipeline -- https://some-company.sk --industry "auto repair" --country SK
 *   npm run pipeline -- --fixture karoseria-hronec        # offline demo
 *
 * All orchestration lives in src/lib/pipeline/ so it can be tested directly
 * (`npm run test:pipeline`). This file only parses argv and prints.
 */
import { PipelineArgsError, USAGE, parsePipelineArgs } from '@/lib/pipeline/args';
import { activeProvider, runPipeline, verifyPersisted } from '@/lib/pipeline/run';

const h1 = (s: string) => console.log(`\n\x1b[1m${s}\x1b[0m\n${'-'.repeat(s.length)}`);

async function main() {
  let args;
  try {
    args = parsePipelineArgs(process.argv.slice(2));
  } catch (err) {
    if (err instanceof PipelineArgsError) {
      console.error(`${err.message}\n\n${USAGE}`);
      process.exit(2);
    }
    throw err;
  }

  // Say which brain is running before the work starts, so a missing key is
  // obvious immediately rather than after a thin-looking audit.
  const provider = activeProvider();
  console.log(provider.name === 'heuristic'
    ? 'reasoning: heuristic (no ANTHROPIC_API_KEY in env or .env.local) - audits will be thinner'
    : `reasoning: ${provider.name} (${provider.model})`);
  console.log(`Auditing ${args.website}${args.fixture ? ' [offline fixture]' : ''} …`);

  const run = await runPipeline(args);

  if (!run.ok) {
    console.error(run.stage === 'crawl'
      ? `\nCould not read ${args.website}. Nothing was saved.`
      : `\nAudit ${run.audit?.status}. It was stored, but it is not fit to show a prospect.`);
    for (const reason of run.reasons) console.error(`  - ${reason}`);
    console.error(`\n${run.hint}`);
    if (run.lead) console.error(`\nThe lead record is at /leads/${run.lead.id}`);
    process.exit(1);
  }

  const { lead, snapshot, result, problem, winner, demo, payback, emails, blueprint } = run;

  h1(`${lead.company_name}  (${lead.website})`);
  console.log(result.business_profile.what_they_do);
  console.log(`intake: ${result.business_profile.intake_channels.join(', ')}`);
  console.log(`booking: ${result.business_profile.booking_model}`);
  console.log(`contacts: ${lead.contacts.map((c) => `${c.kind}:${c.value}`).join(', ') || 'none found'}`);
  console.log(`pages read: ${snapshot.pages.length} · model: ${run.audit.model}`);

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

  h1('THIS IS THE ROI (ALL ESTIMATES, NOT MEASUREMENTS)');
  for (const e of demo.impact) {
    console.log(`  ~ ${e.label}: ${e.low}–${e.high} ${e.unit}  [${e.confidence}]`);
    console.log(`      ${e.assumptions[1] ?? e.assumptions[0]}`);
  }
  console.log(`  ~ ${payback.label}: ${payback.low}–${payback.high} at EUR ${args.buildFee} build + EUR ${args.monthlyFee}/mo`);

  h1('THIS IS THE DEMO SCRIPT');
  console.log(demo.headline);
  console.log('\nBEFORE:');
  for (const b of demo.before) console.log(`  - ${b}`);
  console.log('AFTER:');
  for (const a of demo.after) console.log(`  - ${a}`);
  console.log('');
  for (const s of demo.scenes) console.log(`  ${s.t}  [${s.on_screen}]\n     "${s.narration}"`);

  h1('THIS IS WHAT WE SEND THEM (draft - approve in the UI before sending)');
  console.log(`Subject: ${emails[0].subject}\n`);
  console.log(emails[0].body);
  if (emails.length > 1) console.log(`\n(+${emails.length - 1} follow-up draft(s) on the lead record)`);

  h1('IF THEY BUY, THIS IS THE BUILD');
  console.log(`${blueprint.steps.length} steps · ${blueprint.deployment_checklist.length} checklist items`);
  console.log('credentials needed (names only — values go in the secret store):');
  for (const c of blueprint.credentials.filter((x) => x.required)) console.log(`  - ${c.env_var}  (${c.provider})`);
  console.log(`handoff: ${blueprint.human_handoff.route_to} — ${blueprint.human_handoff.sla}`);
  console.log('\nThe blueprint above is a preview and is NOT stored: an agent belongs to a client,');
  console.log('and a prospect who has not bought must not appear in your client list. It is saved');
  console.log('when you mark the lead won and create the agent.');

  const check = await verifyPersisted(run.persisted);
  h1('SAVED');
  console.log(`  lead      ${run.persisted.lead_id}`);
  console.log(`  snapshot  ${run.persisted.snapshot_id} (${snapshot.pages.length} pages)`);
  console.log(`  audit     ${run.persisted.audit_id}`);
  console.log(`  demo      ${run.persisted.demo_id}`);
  console.log(`  outreach  ${run.persisted.outreach_ids.length} draft(s)`);
  console.log(`  store     ${process.env.DATABASE_URL ? 'postgres' : `file (${process.env.DATA_FILE ?? '.data/studio.json'})`}`);
  if (!check.ok) {
    console.error(`\nWARNING: these records could not be read back: ${check.missing.join(', ')}`);
    process.exit(1);
  }

  console.log(`\nOpen the full record: /leads/${lead.id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
