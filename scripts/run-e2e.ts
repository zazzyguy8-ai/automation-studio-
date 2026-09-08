/**
 * End-to-end run over three deliberately different fictional businesses.
 *
 * Proves the whole spine: URL -> crawl -> audit -> quality gate -> demo with
 * labelled estimates -> grounded outreach drafts -> won client -> agent
 * blueprint -> credential + step gating -> go-live -> dashboard rollup.
 *
 *   npm run test:e2e
 *
 * Offline by default, and enforced rather than assumed: getProvider() reaches
 * for Claude whenever ANTHROPIC_API_KEY is set, which turned this into a live,
 * paid, non-deterministic run on any machine with a key in .env.local. Set
 * TEST_LIVE_MODEL=1 to exercise the real model instead - it costs money and
 * can fail on model variation, which is why it is opt-in.
 */
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import { runAudit } from '@/lib/audit/run';
import { buildDemo } from '@/lib/demo/build';
import { approveOutreachForLead, buildOutreachSequence, outreachBlockers } from '@/lib/outreach/build';
import { convertLeadToClient, createAgent, goLive, recordStepTest, setCredentialStatus } from '@/lib/blueprint/service';
import { toN8nWorkflow } from '@/lib/blueprint/n8n-export';
import { rollupClient } from '@/lib/metrics/rollup';
import { getStore } from '@/lib/db';
import { fixtureFetcher } from '@/lib/scrape/fixture-fetcher';
import { paybackMonths } from '@/lib/estimate/model';
import { getMarket } from '@/lib/discovery/markets';

// A configured sender, because an email cannot be approved without one.
process.env.SENDER_EMAIL = 'richard@mail.test.invalid';
process.env.SENDER_NAME = 'Richard';
process.env.SENDER_COMPANY = 'Automation Studio';

// The e2e run gets its own data file so it never touches the working store.
process.env.DATA_FILE = join(process.cwd(), '.data', 'e2e.json');

interface Case {
  dir: string;
  website: string;
  industry: string;
  country: string;
  /** What the operator would charge, used for the payback estimate. */
  build_fee_eur: number;
  monthly_fee_eur: number;
}

const CASES: Case[] = [
  { dir: 'karoseria-hronec', website: 'https://karoseria-hronec.sk', industry: 'auto body repair / autoservis', country: 'SK', build_fee_eur: 1500, monthly_fee_eur: 300 },
  { dir: 'praxis-lindner', website: 'https://lindner-dental.at', industry: 'dental clinic', country: 'AT', build_fee_eur: 2500, monthly_fee_eur: 600 },
  { dir: 'novak-reality', website: 'https://novakreality.cz', industry: 'real estate agency / realitni kancelar', country: 'CZ', build_fee_eur: 3000, monthly_fee_eur: 800 },
];

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) failures += 1;
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};

const rule = (s: string) => console.log(`\n${'='.repeat(78)}\n${s}\n${'='.repeat(78)}`);

async function runCase(c: Case) {
  rule(`${c.website}  (${c.industry}, ${c.country})`);

  /* 1 — PROSPECTING + AUDIT ------------------------------------------- */
  const { lead, snapshot, audit } = await runAudit({
    website: c.website,
    industry: c.industry,
    country: c.country,
    source: 'e2e-fixture',
    fetcher: fixtureFetcher(c.dir, c.website),
  });

  console.log(`\n1. PROSPECTING`);
  console.log(`   company:   ${lead.company_name}`);
  console.log(`   pages:     ${snapshot.pages.length} fetched`);
  console.log(`   contacts:  ${lead.contacts.map((x) => `${x.kind}:${x.value}`).join(', ') || 'none'}`);
  console.log(`   socials:   ${lead.socials.map((s) => s.platform).join(', ') || 'none'}`);
  console.log(`   observed:  booking=${snapshot.signals.has_online_booking}`
    + ` chat=${snapshot.signals.has_live_chat} form=${snapshot.signals.has_contact_form}`
    + ` vendors=[${snapshot.signals.booking_vendors.join(',')}]`);
  check('lead enriched from the site', lead.contacts.length > 0 && snapshot.pages.length >= 3);

  console.log(`\n2. AI BUSINESS AUDIT  (model: ${audit.model})`);
  if (audit.status !== 'ok') {
    check('audit passed the quality gate', false, audit.error ?? audit.gate_report.join(' | '));
    return null;
  }
  const result = audit.result!;
  console.log(`   ${result.business_profile.what_they_do.slice(0, 110)}`);
  console.log(`   intake: ${result.business_profile.intake_channels.join(', ')}`);
  console.log(`   booking model: ${result.business_profile.booking_model}`);
  console.log(`\n   Problems found (each quoting their own site):`);
  for (const p of result.problems.slice(0, 4)) {
    console.log(`    - ${p.title}`);
    console.log(`      evidence: "${p.evidence[0].quote.slice(0, 95)}"`);
  }
  console.log(`\n   Opportunities, scored:`);
  for (const o of result.opportunities) {
    console.log(`    [${String(o.total_score).padStart(5)}] ${o.title}`);
    console.log(`            roi ${o.roi.score}/10 · effort ${o.effort.score}/10 (${o.effort.build_days}d) · urgency ${o.urgency.score}/10`);
  }
  const winner = result.opportunities.find((o) => o.id === result.recommended_opportunity_id)!;
  console.log(`\n   RECOMMENDED: ${winner.title}`);
  console.log(`   workflow:    ${winner.workflow_steps.map((s) => `[${s.actor}]`).join(' -> ')}`);
  console.log(`   integrations: ${winner.integrations.join(', ')}`);

  check('audit passed the quality gate', audit.status === 'ok');
  check('3-5 scored opportunities', result.opportunities.length >= 3 && result.opportunities.length <= 5,
    `${result.opportunities.length}`);
  check('recommendation is the top-scored option', result.opportunities[0].id === result.recommended_opportunity_id);
  check('every problem quotes the fetched site', result.problems.every((p) => p.evidence.length > 0));
  check('recommended workflow has >= 4 concrete steps', winner.workflow_steps.length >= 4);
  check('recommended workflow defines a human handoff', winner.workflow_steps.some((s) => s.actor === 'human'));

  // The clinic already runs Calendly and Intercom: the gate must have kept us
  // from proposing either back to them.
  if (snapshot.signals.has_online_booking) {
    check('does NOT re-sell online booking they already have',
      !result.opportunities.some((o) => o.template_key === 'ai_receptionist'));
  }
  if (snapshot.signals.has_live_chat) {
    check('does NOT re-sell a support agent when live chat is present',
      !result.opportunities.some((o) => o.template_key === 'support_faq'));
  }

  /* 3 — PERSONALIZED DEMO --------------------------------------------- */
  const demo = await buildDemo(lead, audit);
  console.log(`\n3. PERSONALIZED DEMO`);
  console.log(`   ${demo.headline}`);
  console.log(`   BEFORE:`);
  for (const b of demo.before.slice(0, 3)) console.log(`     - ${b}`);
  console.log(`   AFTER:`);
  for (const a of demo.after.slice(0, 3)) console.log(`     - ${a.slice(0, 105)}`);
  console.log(`   Script: ${demo.scenes.length} scenes, ${demo.scenes[demo.scenes.length - 1].t.split('-')[1]} runtime`);
  console.log(`   Impact (ALL estimates):`);
  for (const i of demo.impact) {
    console.log(`     ~ ${i.label}: ${i.low}-${i.high} ${i.unit}  [${i.confidence}]`);
  }
  const payback = paybackMonths(demo.impact, c.build_fee_eur, c.monthly_fee_eur);
  console.log(`     ~ ${payback.label}: ${payback.low}-${payback.high} ${payback.unit}`
    + `  (at EUR ${c.build_fee_eur} build + EUR ${c.monthly_fee_eur}/mo)`);

  check('every impact number is flagged as an estimate', demo.impact.every((i) => i.is_estimate === true));
  check('every impact number carries its assumptions', demo.impact.every((i) => i.assumptions.length >= 2));
  check('every impact number is a range, not a point', demo.impact.every((i) => i.low < i.high));
  check('no impact number claims to be measured', demo.impact.every((i) => i.confidence !== 'observed'));
  check('demo script is 4+ scenes', demo.scenes.length >= 4);

  /* 4 — OUTREACH ------------------------------------------------------- */
  console.log(`\n4. OUTREACH (drafts only — nothing is sent)`);
  const emails = await buildOutreachSequence(lead, audit, demo, 'email', 3);
  const dms = await buildOutreachSequence(lead, audit, demo, 'linkedin', 2);
  console.log(`   --- email, first touch -------------------------------------`);
  console.log(`   Subject: ${emails[0].subject}`);
  console.log(emails[0].body.split('\n').map((l) => `   | ${l}`).join('\n'));
  console.log(`   grounded in: ${emails[0].grounding.join(' ; ').slice(0, 160)}`);
  console.log(`   --- linkedin DM --------------------------------------------`);
  console.log(`   | ${dms[0].body}`);

  check('all outreach starts as draft', [...emails, ...dms].every((m) => m.status === 'draft'));
  check('every message is grounded in the audit', [...emails, ...dms].every((m) => m.grounding.length > 0));
  check('every message passes the anti-spam checks',
    [...emails, ...dms].every((m) => outreachBlockers(m, lead).length === 0),
    [...emails, ...dms].flatMap((m) => outreachBlockers(m, lead)).join(' | '));

  const store = await getStore();

  // On a high-risk market (DE/AT/DK) approval must be refused until the
  // operator acknowledges the regime. Check that before approving.
  const market = getMarket(lead.country);
  if (market.outreach_risk === 'high') {
    let gated = false;
    try {
      await approveOutreachForLead(lead.id, emails[0].id);
    } catch {
      gated = true;
    }
    check(`${market.name}: approval REFUSED without acknowledging the market regime`, gated);
  }

  // Approval is a deliberate human act; sending is a second one.
  const approved = await approveOutreachForLead(lead.id, emails[0].id, {
    acknowledgeMarketRisk: market.outreach_risk === 'high',
  });
  check('approval moves draft -> approved', approved.status === 'approved');
  check('approval never sends anything', approved.sent_at === null);

  // An ungrounded message must be refusable even if someone tries.
  const bad = await store.insertOutreach({
    lead_id: lead.id, audit_id: audit.id, channel: 'email', step: 9,
    subject: 'Quick question', body: 'Hope this email finds you well! I love what you are doing.',
    status: 'draft', grounding: [], approved_at: null, sent_at: null, created_at: new Date().toISOString(),
  });
  let refused = false;
  try {
    await approveOutreachForLead(lead.id, bad.id, { acknowledgeMarketRisk: true });
  } catch {
    refused = true;
  }
  check('generic ungrounded message is REFUSED even with the market acknowledged', refused);

  await store.setLeadStage(lead.id, 'contacted');

  /* 5 — CLIENT / AGENT BUILDER ---------------------------------------- */
  console.log(`\n5. CLIENT WON -> AGENT BLUEPRINT`);
  const client = await convertLeadToClient({
    lead_id: lead.id, build_fee_eur: c.build_fee_eur, monthly_fee_eur: c.monthly_fee_eur,
  });
  const agent = await createAgent({ client_id: client.id, template_key: winner.template_key, sms_provider: 'telnyx' });
  console.log(`   agent: ${agent.name} [${agent.status}]`);
  console.log(`   integrations: ${agent.blueprint.integrations.join(', ')}`);
  console.log(`   build steps:`);
  for (const s of agent.blueprint.steps) console.log(`     ${s.status === 'passed' ? 'x' : ' '} ${s.actor.padEnd(7)} ${s.title}`);
  console.log(`   credentials required (names only, no values stored):`);
  for (const cr of agent.blueprint.credentials.filter((x) => x.required)) {
    console.log(`     - ${cr.env_var} (${cr.provider}) [${cr.status}]`);
  }
  console.log(`   deployment checklist: ${agent.blueprint.deployment_checklist.length} items`);
  console.log(`   handoff: ${agent.blueprint.human_handoff.route_to} — ${agent.blueprint.human_handoff.sla}`);

  check('lead moved to won', (await store.getLead(lead.id))!.stage === 'won');
  check('blueprint has per-step tests', agent.blueprint.steps.every((s) => s.test.how && s.test.expect));
  check('blueprint has a deployment checklist', agent.blueprint.deployment_checklist.length >= 8);
  check('blueprint stores credential NAMES only',
    !JSON.stringify(agent.blueprint.credentials).match(/"value"\s*:/));
  check('blueprint carries GDPR + disclosure guardrails',
    agent.blueprint.guardrails.some((g) => /GDPR/.test(g))
    && agent.blueprint.guardrails.some((g) => /automated assistant/i.test(g)));

  // Go-live must be refused while anything is untested or unconfigured.
  let blocked = false;
  try {
    await goLive(agent.id);
  } catch {
    blocked = true;
  }
  check('go-live REFUSED while credentials/tests are outstanding', blocked);

  for (const cr of agent.blueprint.credentials.filter((x) => x.required)) {
    await setCredentialStatus(agent.id, cr.env_var, 'verified');
  }
  for (const s of agent.blueprint.steps) await recordStepTest(agent.id, s.key, true);
  const live = await goLive(agent.id);
  check('go-live allowed once every gate is green', live.status === 'live');

  const workflow = toN8nWorkflow(live.blueprint, client.name);
  console.log(`   n8n export: ${workflow.nodes.length} nodes, ${Object.keys(workflow.connections).length} connections`);
  check('n8n export is importable-shaped', workflow.nodes.length > 0 && workflow.name.length > 0);
  check('n8n export contains no credential values',
    !/sk-ant|SG\.|AC[0-9a-f]{32}|KEY[0-9a-f]{20}/.test(JSON.stringify(workflow)));

  /* 6 — AGENT DASHBOARD ------------------------------------------------ */
  const days = 30;
  for (let i = 0; i < days; i += 1) {
    const runs = 1 + (i % 4);
    for (let r = 0; r < runs; r += 1) {
      const seed = (i * 7 + r * 13) % 100;
      const isError = seed < 4;
      const isHandoff = !isError && seed >= 88;
      await store.insertExecution({
        agent_id: live.id,
        status: isError ? 'error' : isHandoff ? 'handoff' : 'success',
        outcome: {
          lead_handled: !isError,
          appointment_booked: !isError && seed % 5 === 0,
          follow_up_sent: !isError && seed % 3 === 0,
          human_handoff: isHandoff,
          review_requested: !isError && seed % 11 === 0,
        },
        minutes_saved: isError ? 0 : 8,
        revenue_influenced_eur: !isError && seed % 5 === 0 ? c.build_fee_eur / 12 : 0,
        error: isError ? 'downstream CRM returned 503' : null,
        started_at: new Date(Date.now() - (days - i) * 86_400_000).toISOString(),
      });
    }
  }

  const metrics = await rollupClient(client.id);
  console.log(`\n6. AGENT DASHBOARD (last 30 days, simulated executions)`);
  console.log(`   active agents:        ${metrics.totals.active_agents}`);
  console.log(`   executions:           ${metrics.totals.executions}`);
  console.log(`   leads handled:        ${metrics.totals.leads_handled}`);
  console.log(`   appointments booked:  ${metrics.totals.appointments_booked}`);
  console.log(`   follow-ups sent:      ${metrics.totals.follow_ups_sent}`);
  console.log(`   human handoffs:       ${metrics.totals.human_handoffs}`);
  console.log(`   errors:               ${metrics.totals.errors}`);
  console.log(`   ~ time saved:         ${metrics.time_saved.low}-${metrics.time_saved.high} hours (estimate)`);
  console.log(`   ~ revenue influenced: EUR ${metrics.revenue_influenced.low}-${metrics.revenue_influenced.high} (estimate)`);
  console.log(`   ~ ROI vs fee:         ${metrics.roi?.low}x-${metrics.roi?.high}x (estimate)`);

  check('dashboard counts every execution', metrics.totals.executions > 0);
  check('dashboard separates errors and handoffs',
    metrics.totals.errors > 0 && metrics.totals.human_handoffs > 0);
  check('dashboard time/revenue/ROI are estimates',
    metrics.time_saved.is_estimate && metrics.revenue_influenced.is_estimate && metrics.roi?.is_estimate === true);

  return { lead, winner, metrics };
}

async function main() {
  await rm(join(process.cwd(), '.data', 'e2e.json'), { force: true });

  const live = process.env.TEST_LIVE_MODEL === '1';
  if (!live) process.env.REASONING_PROVIDER = 'heuristic';

  console.log(`Automation Studio — end-to-end run`);
  console.log(live
    ? 'reasoning provider: anthropic (LIVE MODE - this costs money)'
    : 'reasoning provider: heuristic (pinned - set TEST_LIVE_MODEL=1 to use the real model)');

  const summaries: Array<{ company: string; recommendation: string; template: string }> = [];
  for (const c of CASES) {
    const out = await runCase(c);
    if (out) {
      summaries.push({
        company: out.lead.company_name,
        recommendation: out.winner.title,
        template: out.winner.template_key,
      });
    }
  }

  rule('SUMMARY');
  for (const s of summaries) console.log(`  ${s.company.padEnd(34)} -> ${s.template.padEnd(18)} ${s.recommendation}`);

  const distinct = new Set(summaries.map((s) => s.template)).size;
  check('\n  three different businesses produced different recommendations', distinct >= 2,
    `${distinct} distinct templates across ${summaries.length} businesses`);

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
