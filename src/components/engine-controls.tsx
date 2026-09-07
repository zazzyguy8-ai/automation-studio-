'use client';

import { useState } from 'react';

async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `${res.status}`);
  return data;
}

function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, reloadAfter = true) => {
    setBusy(true); setError(null); setNote(null);
    try {
      const out = await fn();
      if (reloadAfter) window.location.reload();
      else setNote(JSON.stringify(out));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, note, run };
}

/** The kill switch is the first control on the page, deliberately. */
export function KillSwitch({ on, reason }: { on: boolean; reason: string | null }) {
  const { busy, error, run } = useAction();
  return (
    <div className={`banner ${on ? 'bad' : ''}`} style={on ? undefined : { border: '1px solid var(--line)' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <strong>{on ? 'STOPPED — nothing will send' : 'Sending armed'}</strong>
          {on && reason && <div className="small muted">{reason}</div>}
          {!on && <div className="small muted">Approved messages go out on the next send run.</div>}
        </div>
        <button
          className={on ? 'primary' : ''}
          disabled={busy}
          style={on ? undefined : { borderColor: 'var(--bad)', color: 'var(--bad)' }}
          onClick={() => run(() => post('/api/engine/killswitch', {
            on: !on, reason: on ? null : 'stopped from the dashboard',
          }))}
        >
          {on ? 'Resume sending' : 'STOP everything'}
        </button>
      </div>
      {error && <div className="small" style={{ color: 'var(--bad)', marginTop: 8 }}>{error}</div>}
    </div>
  );
}

export function RunButtons({ dryRun }: { dryRun: boolean }) {
  const { busy, error, note, run } = useAction();
  return (
    <>
      <div className="row">
        <button disabled={busy} onClick={() => run(() => post('/api/engine/daily', { demo: true }))}>
          Run daily discovery (demo data)
        </button>
        <button disabled={busy} onClick={() => run(() => post('/api/engine/daily', { demo: false }))}>
          Run daily discovery (live sources)
        </button>
        <button className="primary" disabled={busy} onClick={() => run(() => post('/api/engine/send', {}))}>
          Send approved {dryRun ? '(dry run)' : ''}
        </button>
      </div>
      {dryRun && (
        <p className="small muted" style={{ marginBottom: 0 }}>
          Sending is a dry run: set <span className="mono">RESEND_API_KEY</span> and{' '}
          <span className="mono">OUTREACH_SENDING_ENABLED=true</span> to send for real.
        </p>
      )}
      {note && <div className="banner warn" style={{ marginTop: 10 }}><span className="small mono">{note}</span></div>}
      {error && <div className="banner bad" style={{ marginTop: 10 }}>{error}</div>}
    </>
  );
}

export function LimitsForm({ limits }: {
  limits: {
    daily_send_cap: number; hourly_send_cap: number; min_seconds_between_sends: number;
    quiet_hours_start: number; quiet_hours_end: number;
  };
}) {
  const { busy, error, run } = useAction();
  const [v, setV] = useState(limits);
  // start === end disables the window; the checkbox makes that visible rather
  // than leaving it as a numeric trick only the code knows about.
  const quietOn = v.quiet_hours_start !== v.quiet_hours_end;
  const toggleQuiet = (on: boolean) => setV(on
    ? { ...v, quiet_hours_start: 20, quiet_hours_end: 8 }
    : { ...v, quiet_hours_start: 0, quiet_hours_end: 0 });
  const field = (key: keyof typeof limits, label: string) => (
    <label className="small muted">
      {label}<br />
      <input
        style={{ width: 90 }} value={v[key]}
        onChange={(e) => setV({ ...v, [key]: Number(e.target.value) || 0 })}
      />
    </label>
  );
  return (
    <>
      <div className="row">
        {field('daily_send_cap', 'Per day')}
        {field('hourly_send_cap', 'Per run')}
        {field('min_seconds_between_sends', 'Min gap (s)')}
        {quietOn && field('quiet_hours_start', 'Quiet from')}
        {quietOn && field('quiet_hours_end', 'Quiet until')}
        <button disabled={busy} onClick={() => run(() => post('/api/engine/killswitch', { limits: v }))}>
          Save limits
        </button>
      </div>
      <label className="row small" style={{ gap: 6, marginTop: 10 }}>
        <input type="checkbox" checked={quietOn} onChange={(e) => toggleQuiet(e.target.checked)} />
        Respect quiet hours (sender local time)
        {!quietOn && (
          <span className="pill warn">OFF — time of day will not block sending</span>
        )}
      </label>
      {error && <div className="banner bad" style={{ marginTop: 8 }}>{error}</div>}
    </>
  );
}

export function ReplyForm({ leads }: { leads: Array<{ id: string; company_name: string }> }) {
  const { busy, error, run } = useAction();
  const [leadId, setLeadId] = useState(leads[0]?.id ?? '');
  const [from, setFrom] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  return (
    <>
      <div className="grid g2">
        <label className="small muted">
          Lead<br />
          <select style={{ width: '100%' }} value={leadId} onChange={(e) => setLeadId(e.target.value)}>
            {leads.map((l) => <option key={l.id} value={l.id}>{l.company_name}</option>)}
          </select>
        </label>
        <label className="small muted">
          From address<br />
          <input style={{ width: '100%' }} value={from} onChange={(e) => setFrom(e.target.value)} placeholder="them@company.example" />
        </label>
      </div>
      <label className="small muted">
        Subject<br />
        <input style={{ width: '100%' }} value={subject} onChange={(e) => setSubject(e.target.value)} />
      </label>
      <label className="small muted">
        Their reply<br />
        <textarea style={{ width: '100%', minHeight: 80 }} value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      <div className="row" style={{ marginTop: 10 }}>
        <button
          className="primary" disabled={busy || !leadId || !from || !body}
          onClick={() => run(() => post('/api/engine/replies', {
            lead_id: leadId, from_address: from, subject: subject || null, body,
          }))}
        >
          Record reply
        </button>
        <span className="muted small">
          Classifies it, stops the follow-ups, and suppresses the address on an opt-out or bounce.
        </span>
      </div>
      {error && <div className="banner bad" style={{ marginTop: 8 }}>{error}</div>}
    </>
  );
}

export function SuppressionForm() {
  const { busy, error, run } = useAction();
  const [value, setValue] = useState('');
  const [scope, setScope] = useState<'address' | 'domain'>('address');
  return (
    <>
      <div className="row">
        <input
          style={{ minWidth: 260 }} value={value} onChange={(e) => setValue(e.target.value)}
          placeholder="them@company.example or company.example"
        />
        <select value={scope} onChange={(e) => setScope(e.target.value as 'address' | 'domain')}>
          <option value="address">this address</option>
          <option value="domain">the whole domain</option>
        </select>
        <button
          disabled={busy || !value}
          onClick={() => run(() => post('/api/engine/suppressions', { value, scope, reason: 'manual' }))}
        >
          Never contact
        </button>
      </div>
      {error && <div className="banner bad" style={{ marginTop: 8 }}>{error}</div>}
    </>
  );
}

export function MarkHandled({ replyId, handled }: { replyId: string; handled: boolean }) {
  const { busy, run } = useAction();
  if (handled) return <span className="pill">handled</span>;
  return (
    <button
      disabled={busy}
      onClick={() => run(() => post('/api/engine/replies', { mark_handled: replyId, handled: true }))}
    >
      Mark handled
    </button>
  );
}
