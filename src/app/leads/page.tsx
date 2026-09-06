import { getStore } from '@/lib/db';
import { LEAD_STAGES } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const store = await getStore();
  const all = await store.listLeads();
  const leads = await store.listLeads({
    q: sp.q,
    stage: LEAD_STAGES.includes(sp.stage as never) ? (sp.stage as never) : undefined,
  });

  const counts = Object.fromEntries(
    LEAD_STAGES.map((s) => [s, all.filter((l) => l.stage === s).length]),
  ) as Record<string, number>;

  return (
    <>
      <h2>Pipeline</h2>
      <p className="sub">New → Audited → Contacted → Replied → Call → Proposal → Won / Lost</p>

      <div className="card">
        <div className="row">
          {LEAD_STAGES.map((s) => (
            <a key={s} href={`/leads?stage=${s}`} className="pill">
              {s} <strong style={{ color: 'var(--text)' }}>{counts[s] ?? 0}</strong>
            </a>
          ))}
          <a href="/leads" className="pill">all <strong style={{ color: 'var(--text)' }}>{all.length}</strong></a>
        </div>
      </div>

      <div className="card">
        {leads.length === 0 ? (
          <p className="muted small">No leads in this view.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Company</th><th>Industry</th><th>Country</th>
                <th>Contacts</th><th>Stage</th><th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id}>
                  <td>
                    <a href={`/leads/${l.id}`}>{l.company_name}</a>
                    <div className="muted small">{l.website}</div>
                  </td>
                  <td className="muted">{l.industry ?? '—'}</td>
                  <td className="muted">{l.country ?? '—'}</td>
                  <td className="muted small">
                    {l.contacts.length === 0 ? '—' : l.contacts.slice(0, 2).map((c) => c.value).join(', ')}
                  </td>
                  <td><span className="pill">{l.stage}</span></td>
                  <td className="muted small">{l.updated_at.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
