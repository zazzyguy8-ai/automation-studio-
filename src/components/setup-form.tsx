'use client';

import { useState } from 'react';
import { OUTREACH_MODES, TICKETS, MAX_PER_DAY, type OutreachMode, type Ticket } from '@/lib/engine/onboarding';

interface Result {
  campaign: { id: string; name: string; daily_target: number; daily_send_cap: number };
  adjustments: string[];
  extra_cities: string[];
  projection: { discovered: [number, number]; drafted: [number, number]; assumptions: string[] };
}

export function SetupForm() {
  const [v, setV] = useState({
    what_you_do: '',
    what_you_offer: '',
    target_industry: '',
    country: '',
    cities: '',
    ticket: 'mid' as Ticket,
    build_fee_eur: 1500,
    monthly_fee_eur: 300,
    leads_per_day: 20,
    mode: 'email' as OutreachMode,
  });
  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState<Array<{ field: string; message: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const set = <K extends keyof typeof v>(k: K, value: (typeof v)[K]) => setV({ ...v, [k]: value });
  const issueFor = (field: string) => issues.find((i) => i.field === field)?.message;

  const submit = async () => {
    setBusy(true); setError(null); setIssues([]); setResult(null);
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...v,
          country: v.country.trim().toUpperCase(),
          cities: v.cities.split(',').map((c) => c.trim()).filter(Boolean),
          build_fee_eur: Number(v.build_fee_eur) || 0,
          monthly_fee_eur: Number(v.monthly_fee_eur) || 0,
          leads_per_day: Number(v.leads_per_day) || 1,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setIssues(data.issues ?? []);
        setError(data.error ?? `${res.status}`);
        return;
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const field = (
    key: keyof typeof v, label: string, hint: string,
    input: React.ReactNode,
  ) => (
    <div style={{ marginBottom: 22 }}>
      <label className="small" style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>{label}</label>
      <p className="small muted" style={{ margin: '0 0 8px' }}>{hint}</p>
      {input}
      {issueFor(key) && <p className="small" style={{ color: 'var(--bad)', margin: '6px 0 0' }}>{issueFor(key)}</p>}
    </div>
  );

  if (result) {
    return (
      <div>
        <div className="banner" style={{ border: '1px solid var(--line)' }}>
          <strong>Campaign created — {result.campaign.name}</strong>
          <div className="small muted" style={{ marginTop: 4 }}>
            Nothing has been sent. Nothing will be, until you approve it.
          </div>
        </div>

        <h2 style={{ marginTop: 28 }}>What it will do each day</h2>
        <div className="row">
          <div className="card"><strong>{result.campaign.daily_target}</strong><div className="small muted">companies found</div></div>
          <div className="card"><strong>{result.campaign.daily_send_cap}</strong><div className="small muted">worth drafting for</div></div>
        </div>

        <h2 style={{ marginTop: 28 }}>Over a month <span className="pill warn">estimate</span></h2>
        <p className="muted small" style={{ marginTop: 0 }}>
          Arithmetic over what you just typed — not a measurement of anything.
        </p>
        <ul className="small muted">
          <li>{result.projection.discovered[0]}–{result.projection.discovered[1]} companies found</li>
          <li>{result.projection.drafted[0]}–{result.projection.drafted[1]} messages drafted for your approval</li>
        </ul>
        <p className="small muted" style={{ marginBottom: 4 }}>Assuming:</p>
        <ul className="small muted">
          {result.projection.assumptions.map((a) => <li key={a}>{a}</li>)}
        </ul>

        {result.adjustments.length > 0 && (
          <>
            <h2 style={{ marginTop: 28 }}>What was adjusted</h2>
            <ul className="small muted">
              {result.adjustments.map((a) => <li key={a}>{a}</li>)}
            </ul>
          </>
        )}

        <div className="row" style={{ marginTop: 28 }}>
          <a className="primary" href="/engine" style={{ padding: '10px 18px', borderRadius: 999 }}>
            Go to the approval inbox →
          </a>
          <button onClick={() => setResult(null)}>Set up another</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640 }}>
      {field('what_you_do', 'What do you do?',
        'One sentence, in your words. It goes into every message.',
        <input style={{ width: '100%' }} value={v.what_you_do}
          onChange={(e) => set('what_you_do', e.target.value)}
          placeholder="I build booking systems for small clinics" />)}

      {field('what_you_offer', 'What are they actually buying?',
        'The concrete thing. Not the benefit — the deliverable.',
        <input style={{ width: '100%' }} value={v.what_you_offer}
          onChange={(e) => set('what_you_offer', e.target.value)}
          placeholder="A booking system wired into their existing calendar, built in two weeks" />)}

      {field('target_industry', 'Who do you want to reach?',
        'The kind of business. Any language — the engine matches it against a multilingual list.',
        <input style={{ width: '100%' }} value={v.target_industry}
          onChange={(e) => set('target_industry', e.target.value)}
          placeholder="dental clinic, autoservis, Immobilienmakler…" />)}

      <div className="grid g2">
        {field('country', 'Country',
          'Two-letter code.',
          <input style={{ width: '100%' }} value={v.country} maxLength={2}
            onChange={(e) => set('country', e.target.value)} placeholder="GB" />)}

        {field('cities', 'Cities',
          'Comma separated. Each becomes its own run.',
          <input style={{ width: '100%' }} value={v.cities}
            onChange={(e) => set('cities', e.target.value)} placeholder="Manchester, Leeds, Bristol" />)}
      </div>

      {field('ticket', 'How big is one deal?',
        'This decides how many leads a day makes sense.',
        <div className="row">
          {TICKETS.map((t) => (
            <button key={t.value} onClick={() => set('ticket', t.value)}
              className={v.ticket === t.value ? 'primary' : ''}
              style={{ flexDirection: 'column', alignItems: 'flex-start', textAlign: 'left' }}>
              <span>{t.label}</span>
            </button>
          ))}
        </div>)}

      <div className="grid g2">
        {field('build_fee_eur', 'One-off fee (EUR)', 'What you charge to build it.',
          <input style={{ width: '100%' }} value={v.build_fee_eur}
            onChange={(e) => set('build_fee_eur', Number(e.target.value) || 0)} />)}
        {field('monthly_fee_eur', 'Monthly fee (EUR)', 'Nothing recurring? Put 0.',
          <input style={{ width: '100%' }} value={v.monthly_fee_eur}
            onChange={(e) => set('monthly_fee_eur', Number(e.target.value) || 0)} />)}
      </div>

      {field('leads_per_day', 'How many leads a day?',
        `At this deal size the engine will hold you to ${MAX_PER_DAY[v.ticket]} a day, and will say so.`,
        <input style={{ width: 120 }} value={v.leads_per_day}
          onChange={(e) => set('leads_per_day', Number(e.target.value) || 1)} />)}

      {field('mode', 'How much should it do?',
        'You stay in control of where it stops.',
        <div>
          {OUTREACH_MODES.map((m) => (
            <label key={m.value} className="row" style={{ gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
              <input type="radio" name="mode" checked={v.mode === m.value}
                onChange={() => set('mode', m.value)} style={{ marginTop: 4 }} />
              <span>
                <strong className="small">{m.label}</strong>
                <div className="small muted">{m.detail}</div>
              </span>
            </label>
          ))}
        </div>)}

      {error && <div className="banner bad" style={{ marginBottom: 14 }}>{error}</div>}

      <button className="primary" disabled={busy} onClick={submit} style={{ padding: '10px 22px' }}>
        {busy ? 'Setting up…' : 'Create the campaign'}
      </button>
      <p className="small muted" style={{ marginTop: 10 }}>
        This creates the campaign. It does not send anything.
      </p>
    </div>
  );
}
