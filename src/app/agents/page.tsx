import { getStore } from '@/lib/db';
import { readiness } from '@/lib/blueprint/build';
import { TEMPLATES } from '@/lib/blueprint/templates';

export const dynamic = 'force-dynamic';

export default async function AgentsPage() {
  const store = await getStore();
  const agents = await store.listAgents();
  const clients = await store.listClients();
  const nameOf = (id: string) => clients.find((c) => c.id === id)?.name ?? id;

  return (
    <>
      <h2>Agents</h2>
      <p className="sub">Every agent built for a client, and what still blocks it from going live.</p>

      {agents.length === 0 ? (
        <div className="card muted small">No agents yet.</div>
      ) : (
        <div className="card">
          <table>
            <thead><tr><th>Agent</th><th>Client</th><th>Status</th><th>Blocking</th></tr></thead>
            <tbody>
              {agents.map((a) => {
                const r = readiness(a.blueprint);
                return (
                  <tr key={a.id}>
                    <td><a href={`/agents/${a.id}`}>{a.name}</a>
                      <div className="muted small mono">{a.template_key}</div></td>
                    <td><a href={`/clients/${a.client_id}`}>{nameOf(a.client_id)}</a></td>
                    <td><span className={`pill ${a.status === 'live' ? 'good' : ''}`}>{a.status}</span></td>
                    <td className="small muted">
                      {r.ready ? 'nothing — ready' : (
                        <>
                          {r.credentials_missing.length > 0 && <div>{r.credentials_missing.length} credential(s) missing</div>}
                          {r.steps_untested.length > 0 && <div>{r.steps_untested.length} step(s) untested</div>}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h3>Template library</h3>
      <div className="grid g2">
        {TEMPLATES.map((t) => (
          <div className="card" key={t.key}>
            <strong>{t.letter}. {t.name}</strong>
            <p className="small muted" style={{ marginBottom: 6 }}>{t.when_to_use}</p>
            <div className="small muted">
              {t.steps.length} steps · {t.build_days} build day(s) · {t.integrations.join(', ')}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
