import { notFound } from 'next/navigation';
import { getStore } from '@/lib/db';
import { rollupClient } from '@/lib/metrics/rollup';
import { readiness } from '@/lib/blueprint/build';
import { EstimateCard } from '@/components/estimate-card';
import { CreateAgentForm } from '@/components/agent-actions';

export const dynamic = 'force-dynamic';

function Stat({ n, l }: { n: number | string; l: string }) {
  return (
    <div className="card stat">
      <div className="n">{n}</div>
      <div className="l">{l}</div>
    </div>
  );
}

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await getStore();
  const client = await store.getClient(id);
  if (!client) notFound();

  const metrics = await rollupClient(id);
  const agents = await store.listAgents(id);
  const audit = client.lead_id ? await store.latestAudit(client.lead_id) : null;
  const suggested = audit?.result?.opportunities.find(
    (o) => o.id === audit.result?.recommended_opportunity_id,
  )?.template_key;

  return (
    <>
      <h2>{client.name}</h2>
      <p className="sub">
        {client.country ?? '—'} · build EUR {client.build_fee_eur ?? '—'} · EUR {client.monthly_fee_eur ?? '—'}/month
        {client.lead_id && <> · <a href={`/leads/${client.lead_id}`}>original audit</a></>}
        {' '}· Stripe: <span className="pill">{client.stripe_customer_id ?? 'not connected'}</span>
      </p>

      <h3>Dashboard</h3>
      <div className="grid g4">
        <Stat n={metrics.totals.active_agents} l="active agents" />
        <Stat n={metrics.totals.executions} l="executions" />
        <Stat n={metrics.totals.leads_handled} l="leads handled" />
        <Stat n={metrics.totals.appointments_booked} l="appointments booked" />
        <Stat n={metrics.totals.follow_ups_sent} l="follow-ups sent" />
        <Stat n={metrics.totals.human_handoffs} l="human handoffs" />
        <Stat n={metrics.totals.errors} l="errors" />
        <Stat
          n={metrics.totals.executions ? `${Math.round((metrics.totals.errors / metrics.totals.executions) * 100)}%` : '—'}
          l="error rate"
        />
      </div>
      <p className="small muted">
        The eight figures above are counted from the execution log. The three below are estimates:
        the counts are real, the value assigned to each execution is a configured assumption.
      </p>
      <div className="grid g3">
        <div className="card"><EstimateCard estimate={metrics.time_saved} /></div>
        <div className="card"><EstimateCard estimate={metrics.revenue_influenced} /></div>
        {metrics.roi && <div className="card"><EstimateCard estimate={metrics.roi} /></div>}
      </div>

      <h3>Agents</h3>
      <div className="card">
        <CreateAgentForm clientId={client.id} suggested={suggested} />
      </div>

      {agents.map((a) => {
        const r = readiness(a.blueprint);
        const m = metrics.agents.find((x) => x.agent_id === a.id);
        return (
          <div className="card" key={a.id}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong><a href={`/agents/${a.id}`}>{a.name}</a></strong>
              <span className={`pill ${a.status === 'live' ? 'good' : ''}`}>{a.status}</span>
            </div>
            <div className="row small muted" style={{ marginTop: 6 }}>
              <span>{a.blueprint.steps.length} steps</span>
              <span>· {m?.executions ?? 0} executions</span>
              <span>· {m?.human_handoffs ?? 0} handoffs</span>
              <span>· {m?.errors ?? 0} errors</span>
              <span>· {r.ready ? 'ready' : `${r.credentials_missing.length} credentials + ${r.steps_untested.length} tests outstanding`}</span>
            </div>
          </div>
        );
      })}
    </>
  );
}
