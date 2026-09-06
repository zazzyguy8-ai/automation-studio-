import { notFound } from 'next/navigation';
import { getStore } from '@/lib/db';
import { readiness } from '@/lib/blueprint/build';
import { rollupAgent } from '@/lib/metrics/rollup';
import { CredentialToggle, GoLiveButton, StepTestButtons } from '@/components/agent-actions';

export const dynamic = 'force-dynamic';

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await getStore();
  const agent = await store.getAgent(id);
  if (!agent) notFound();

  const client = await store.getClient(agent.client_id);
  const executions = await store.listExecutions(agent.id, 20);
  const metrics = rollupAgent(agent, await store.listExecutions(agent.id, 5000));
  const check = readiness(agent.blueprint);
  const bp = agent.blueprint;

  return (
    <>
      <h2>{agent.name}</h2>
      <p className="sub">
        <a href={`/clients/${agent.client_id}`}>{client?.name}</a> · template <span className="mono">{bp.template_key}</span>
      </p>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <span className={`pill ${agent.status === 'live' ? 'good' : ''}`}>{agent.status}</span>{' '}
            <span className="muted small">
              {check.ready
                ? 'all credentials in place and every step tested'
                : `${check.credentials_missing.length} credential(s) missing · ${check.steps_untested.length} step(s) untested`}
            </span>
          </div>
          <div className="row">
            <a className="pill" href={`/api/agents/${agent.id}/n8n`}>download n8n workflow</a>
            <GoLiveButton agentId={agent.id} status={agent.status} />
          </div>
        </div>
        <p className="small muted" style={{ marginBottom: 0, marginTop: 10 }}>{bp.summary}</p>
      </div>

      <h3>Build steps</h3>
      <div className="card">
        <table>
          <thead><tr><th style={{ width: 70 }}>Actor</th><th>Step</th><th>Test</th><th style={{ width: 120 }}>Result</th></tr></thead>
          <tbody>
            {bp.steps.map((s) => (
              <tr key={s.key}>
                <td className="small muted">{s.actor}</td>
                <td>
                  <strong className="small">{s.title}</strong>
                  <div className="muted small">{s.description}</div>
                  {s.integration && <div className="muted small">via {s.integration}</div>}
                  {s.config_keys.length > 0 && <div className="mono muted">{s.config_keys.join(', ')}</div>}
                </td>
                <td className="small muted">
                  <div>{s.test.how}</div>
                  <div style={{ marginTop: 4 }}>expect: {s.test.expect}</div>
                </td>
                <td>
                  <span className={`pill ${s.status === 'passed' ? 'good' : s.status === 'failed' ? 'bad' : ''}`}>{s.status}</span>
                  <StepTestButtons agentId={agent.id} stepKey={s.key} status={s.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Credentials</h3>
      <div className="banner warn">
        Only names are stored here. Put the actual values in the n8n credential store or your
        platform&apos;s environment variables — this system has nowhere to keep one, by design.
      </div>
      <div className="card">
        <table>
          <thead><tr><th>Env var</th><th>Provider</th><th>Used for</th><th>Required</th><th style={{ width: 170 }}>State</th></tr></thead>
          <tbody>
            {bp.credentials.map((c) => (
              <tr key={c.env_var}>
                <td className="mono">{c.env_var}</td>
                <td className="muted small">{c.provider}</td>
                <td className="muted small">{c.scope}</td>
                <td className="small">{c.required ? 'yes' : 'optional'}</td>
                <td><CredentialToggle agentId={agent.id} envVar={c.env_var} status={c.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Human handoff</h3>
      <div className="card">
        <p className="small" style={{ marginTop: 0 }}>
          Routes to <strong>{bp.human_handoff.route_to}</strong> — {bp.human_handoff.sla}
        </p>
        <ul style={{ margin: 0, paddingLeft: 18 }} className="small muted">
          {bp.human_handoff.triggers.map((t, i) => <li key={i}>{t}</li>)}
        </ul>
      </div>

      <h3>Guardrails</h3>
      <div className="card">
        <ul style={{ margin: 0, paddingLeft: 18 }} className="small">
          {bp.guardrails.map((g, i) => <li key={i}>{g}</li>)}
        </ul>
      </div>

      <h3>Deployment checklist</h3>
      <div className="card">
        <ol style={{ margin: 0, paddingLeft: 18 }} className="small">
          {bp.deployment_checklist.map((c, i) => <li key={i} style={{ marginBottom: 4 }}>{c}</li>)}
        </ol>
      </div>

      <h3>Executions</h3>
      <div className="grid g4">
        <div className="card stat"><div className="n">{metrics.executions}</div><div className="l">executions</div></div>
        <div className="card stat"><div className="n">{metrics.leads_handled}</div><div className="l">leads handled</div></div>
        <div className="card stat"><div className="n">{metrics.human_handoffs}</div><div className="l">handoffs</div></div>
        <div className="card stat"><div className="n">{metrics.errors}</div><div className="l">errors</div></div>
      </div>
      <div className="card">
        {executions.length === 0 ? <span className="muted small">No executions recorded yet.</span> : (
          <table>
            <thead><tr><th>When</th><th>Status</th><th>Outcome</th><th>Error</th></tr></thead>
            <tbody>
              {executions.map((e) => (
                <tr key={e.id}>
                  <td className="mono small">{new Date(e.started_at).toLocaleString('en-GB')}</td>
                  <td><span className={`pill ${e.status === 'error' ? 'bad' : e.status === 'handoff' ? 'warn' : 'good'}`}>{e.status}</span></td>
                  <td className="small muted">
                    {Object.entries(e.outcome).filter(([, v]) => v).map(([k]) => k).join(', ') || '—'}
                  </td>
                  <td className="small muted">{e.error ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
