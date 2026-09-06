'use client';

import { useState } from 'react';

async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `${res.status}`);
  return data;
}

function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };
  return { busy, error, run };
}

export function BuildDemoButton({ leadId }: { leadId: string }) {
  const { busy, error, run } = useAction();
  return (
    <>
      <button className="primary" disabled={busy} onClick={() => run(() => post('/api/demo', { lead_id: leadId }))}>
        {busy ? 'Building…' : 'Build personalised demo'}
      </button>
      {error && <div className="banner bad" style={{ marginTop: 10 }}>{error}</div>}
    </>
  );
}

export function BuildOutreachButtons({ leadId, hasDemo }: { leadId: string; hasDemo: boolean }) {
  const { busy, error, run } = useAction();
  return (
    <>
      <div className="row">
        <button
          disabled={busy || !hasDemo}
          onClick={() => run(() => post('/api/outreach', { lead_id: leadId, channel: 'email', steps: 3 }))}
        >
          Draft email sequence (3)
        </button>
        <button
          disabled={busy || !hasDemo}
          onClick={() => run(() => post('/api/outreach', { lead_id: leadId, channel: 'linkedin', steps: 2 }))}
        >
          Draft LinkedIn DMs (2)
        </button>
        <button
          disabled={busy || !hasDemo}
          onClick={() => run(() => post('/api/outreach', { lead_id: leadId, channel: 'instagram', steps: 2 }))}
        >
          Draft Instagram DMs (2)
        </button>
      </div>
      {!hasDemo && <p className="muted small">Build the demo first — outreach quotes its estimates.</p>}
      {error && <div className="banner bad" style={{ marginTop: 10 }}>{error}</div>}
    </>
  );
}

export function OutreachControls({
  leadId, messageId, status, blockers, warnings = [], requiresAck = false, marketNote = '',
}: {
  leadId: string; messageId: string; status: string; blockers: string[];
  warnings?: string[]; requiresAck?: boolean; marketNote?: string;
}) {
  const { busy, error, run } = useAction();
  const [ack, setAck] = useState(false);
  return (
    <>
      {warnings.length > 0 && status === 'draft' && (
        <div className={`banner ${requiresAck ? 'bad' : 'warn'}`} style={{ marginTop: 8 }}>
          <strong>Skontroluj pred schválením</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {warnings.map((w, i) => <li key={i} className="small">{w}</li>)}
          </ul>
          {requiresAck && (
            <label className="row small" style={{ gap: 6, marginTop: 10 }}>
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              Rozumiem riziku na tomto trhu a beriem zodpovednosť za odoslanie.
            </label>
          )}
        </div>
      )}
      <div className="row" style={{ marginTop: 8 }}>
        {status === 'draft' && (
          <button
            className="primary"
            disabled={busy || blockers.length > 0 || (requiresAck && !ack)}
            title={requiresAck && !ack ? marketNote : blockers.join(' | ')}
            onClick={() => run(() => post(`/api/outreach/${messageId}`, {
              lead_id: leadId, action: 'approve', acknowledge_market_risk: ack,
            }))}
          >
            Approve
          </button>
        )}
        {status === 'draft' && (
          <button disabled={busy} onClick={() => run(() => post(`/api/outreach/${messageId}`, { lead_id: leadId, action: 'reject' }))}>
            Reject
          </button>
        )}
        {status === 'approved' && (
          <button disabled={busy} onClick={() => run(() => post(`/api/outreach/${messageId}`, { lead_id: leadId, action: 'mark_sent' }))}>
            I sent this
          </button>
        )}
      </div>
      {blockers.length > 0 && (
        <div className="banner warn" style={{ marginTop: 8 }}>
          Approval blocked:
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {blockers.map((b, i) => <li key={i} className="small">{b}</li>)}
          </ul>
        </div>
      )}
      {error && <div className="banner bad" style={{ marginTop: 8 }}>{error}</div>}
    </>
  );
}

export function StageSelect({ leadId, stage }: { leadId: string; stage: string }) {
  const { busy, error, run } = useAction();
  const stages = ['new', 'audited', 'contacted', 'replied', 'call', 'proposal', 'won', 'lost'];
  return (
    <>
      <select
        value={stage}
        disabled={busy}
        onChange={(e) => run(() => post(`/api/leads/${leadId}/stage`, { stage: e.target.value }))}
      >
        {stages.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      {error && <span className="small" style={{ color: 'var(--bad)' }}> {error}</span>}
    </>
  );
}

export function WinClientForm({ leadId }: { leadId: string }) {
  const { busy, error, run } = useAction();
  const [build, setBuild] = useState('1500');
  const [monthly, setMonthly] = useState('300');
  return (
    <>
      <div className="row">
        <label className="small muted">
          Build fee (EUR)<br />
          <input style={{ width: 110 }} value={build} onChange={(e) => setBuild(e.target.value)} />
        </label>
        <label className="small muted">
          Monthly (EUR)<br />
          <input style={{ width: 110 }} value={monthly} onChange={(e) => setMonthly(e.target.value)} />
        </label>
        <button
          className="primary"
          disabled={busy}
          onClick={() => run(() => post('/api/clients', {
            lead_id: leadId, build_fee_eur: Number(build), monthly_fee_eur: Number(monthly),
          }))}
        >
          {busy ? 'Creating…' : 'Won — create client'}
        </button>
      </div>
      {error && <div className="banner bad" style={{ marginTop: 8 }}>{error}</div>}
    </>
  );
}
