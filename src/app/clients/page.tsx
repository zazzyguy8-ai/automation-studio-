import { getStore } from '@/lib/db';
import { rollupClient } from '@/lib/metrics/rollup';

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  const store = await getStore();
  const clients = await store.listClients();
  const rows = await Promise.all(clients.map(async (c) => ({ client: c, metrics: await rollupClient(c.id) })));

  return (
    <>
      <h2>Clients</h2>
      <p className="sub">Won deals and what their agents have actually done.</p>
      {rows.length === 0 ? (
        <div className="card muted small">No clients yet. Win a lead from its detail page.</div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Client</th><th>Agents</th><th>Executions</th><th>Handoffs</th>
                <th>Errors</th><th>Monthly fee</th><th>Est. ROI</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ client, metrics }) => (
                <tr key={client.id}>
                  <td><a href={`/clients/${client.id}`}>{client.name}</a>
                    <div className="muted small">{client.country ?? '—'}</div></td>
                  <td>{metrics.agents.length} <span className="muted small">({metrics.totals.active_agents} live)</span></td>
                  <td>{metrics.totals.executions}</td>
                  <td>{metrics.totals.human_handoffs}</td>
                  <td>{metrics.totals.errors}</td>
                  <td>{client.monthly_fee_eur != null ? `EUR ${client.monthly_fee_eur}` : '—'}</td>
                  <td>{metrics.roi ? <span className="pill warn">{metrics.roi.low}x–{metrics.roi.high}x est.</span> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
