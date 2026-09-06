/**
 * Fills the local store with the three fixture businesses, one won client,
 * a live agent and 30 days of simulated executions, so every screen has
 * something real on it.
 *
 *   npm run seed
 *
 * Executions here are SIMULATED and exist only to exercise the dashboard.
 * Never show a client a dashboard seeded by this script.
 */
import { runAudit } from '@/lib/audit/run';
import { buildDemo } from '@/lib/demo/build';
import { buildOutreachSequence } from '@/lib/outreach/build';
import { convertLeadToClient, createAgent, goLive, recordStepTest, setCredentialStatus } from '@/lib/blueprint/service';
import { fixtureFetcher } from '@/lib/scrape/fixture-fetcher';
import { getStore } from '@/lib/db';

const CASES = [
  { dir: 'karoseria-hronec', website: 'https://karoseria-hronec.sk', industry: 'auto body repair', country: 'SK' },
  { dir: 'praxis-lindner', website: 'https://lindner-dental.at', industry: 'dental clinic', country: 'AT' },
  { dir: 'novak-reality', website: 'https://novakreality.cz', industry: 'real estate agency', country: 'CZ' },
];

async function main() {
  const store = await getStore();

  for (const [i, c] of CASES.entries()) {
    const { lead, audit } = await runAudit({
      website: c.website, industry: c.industry, country: c.country,
      source: 'seed', fetcher: fixtureFetcher(c.dir, c.website),
    });
    if (audit.status !== 'ok') {
      console.log(`${lead.company_name}: audit ${audit.status} — ${audit.gate_report.join(' | ')}`);
      continue;
    }
    const demo = await buildDemo(lead, audit);
    await buildOutreachSequence(lead, audit, demo, 'email', 3);
    await buildOutreachSequence(lead, audit, demo, 'linkedin', 2);
    console.log(`${lead.company_name}: audited, demo + outreach drafted`);

    // Take only the first one all the way to a live agent, so the pipeline
    // still shows leads at different stages.
    if (i > 0) {
      await store.setLeadStage(lead.id, i === 1 ? 'contacted' : 'replied');
      continue;
    }

    const result = audit.result!;
    const winner = result.opportunities.find((o) => o.id === result.recommended_opportunity_id)!;
    const client = await convertLeadToClient({ lead_id: lead.id, build_fee_eur: 1500, monthly_fee_eur: 300 });
    const agent = await createAgent({ client_id: client.id, template_key: winner.template_key });

    for (const cred of agent.blueprint.credentials.filter((x) => x.required)) {
      await setCredentialStatus(agent.id, cred.env_var, 'verified');
    }
    for (const step of agent.blueprint.steps) await recordStepTest(agent.id, step.key, true);
    const live = await goLive(agent.id);

    let n = 0;
    for (let d = 0; d < 30; d += 1) {
      for (let r = 0; r < 1 + (d % 4); r += 1) {
        const seed = (d * 7 + r * 13) % 100;
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
          revenue_influenced_eur: !isError && seed % 5 === 0 ? 125 : 0,
          error: isError ? 'downstream CRM returned 503' : null,
          started_at: new Date(Date.now() - (30 - d) * 86_400_000).toISOString(),
        });
        n += 1;
      }
    }
    console.log(`${client.name}: client + live agent + ${n} SIMULATED executions`);
  }

  console.log('\nOpen http://localhost:3000 after `npm run dev`.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
