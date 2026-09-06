'use client';

import { useState } from 'react';

export function AuditForm() {
  const [website, setWebsite] = useState('');
  const [industry, setIndustry] = useState('');
  const [country, setCountry] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gateReport, setGateReport] = useState<string[]>([]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setGateReport([]);
    try {
      const res = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ website, industry: industry || null, country: country || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'audit failed');
      if (data.audit.status !== 'ok') {
        // A rejected audit is shown, not hidden: the reasons are the useful part.
        setGateReport(data.audit.gate_report.length ? data.audit.gate_report : [data.audit.error]);
        setError(`Audit was rejected by the quality gate (${data.audit.status}).`);
        return;
      }
      window.location.href = `/leads/${data.lead.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <div className="grid g3">
        <label>
          <div className="small muted">Company URL</div>
          <input
            required
            style={{ width: '100%' }}
            placeholder="karoseria-hronec.sk"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </label>
        <label>
          <div className="small muted">Industry (optional, tunes the estimate defaults)</div>
          <input
            style={{ width: '100%' }}
            placeholder="auto repair / dental clinic / real estate"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
          />
        </label>
        <label>
          <div className="small muted">Country</div>
          <input
            style={{ width: '100%' }}
            placeholder="SK"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          />
        </label>
      </div>
      <div className="row" style={{ marginTop: 14 }}>
        <button className="primary" disabled={busy || !website}>
          {busy ? 'Crawling and auditing…' : 'Run audit'}
        </button>
        <span className="muted small">Takes 20–60 seconds. Nothing is sent to the company.</span>
      </div>

      {error && (
        <div className="banner bad" style={{ marginTop: 14 }}>
          <strong>{error}</strong>
          {gateReport.length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {gateReport.map((g, i) => <li key={i} className="small">{g}</li>)}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
