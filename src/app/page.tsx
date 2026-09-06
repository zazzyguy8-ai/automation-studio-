import { getStore } from '@/lib/db';
import { AuditForm } from '@/components/audit-form';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const store = await getStore();
  const leads = await store.listLeads();
  const recent = leads.slice(0, 6);

  return (
    <>
      <h2>Run an audit</h2>
      <p className="sub">
        Paste a company URL. The crawler reads their public pages, the audit finds the manual
        work that costs them money, and everything downstream is built from that one audit.
      </p>

      <AuditForm />

      <h3>Recent leads</h3>
      {recent.length === 0 ? (
        <p className="muted small">Nothing yet. Run your first audit above.</p>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr><th>Company</th><th>Industry</th><th>Country</th><th>Stage</th></tr>
            </thead>
            <tbody>
              {recent.map((l) => (
                <tr key={l.id}>
                  <td><a href={`/leads/${l.id}`}>{l.company_name}</a><div className="muted small">{l.website}</div></td>
                  <td className="muted">{l.industry ?? '—'}</td>
                  <td className="muted">{l.country ?? '—'}</td>
                  <td><span className="pill">{l.stage}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
