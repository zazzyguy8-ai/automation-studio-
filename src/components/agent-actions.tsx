'use client';

import { useState } from 'react';
import { TEMPLATES } from '@/lib/blueprint/templates';

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

export function CreateAgentForm({ clientId, suggested }: { clientId: string; suggested?: string }) {
  const { busy, error, run } = useAction();
  const [template, setTemplate] = useState(suggested ?? TEMPLATES[0].key);
  const [sms, setSms] = useState<'telnyx' | 'twilio'>('telnyx');
  return (
    <>
      <div className="row">
        <select value={template} onChange={(e) => setTemplate(e.target.value)}>
          {TEMPLATES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.letter}. {t.name}{t.key === suggested ? '  (from their audit)' : ''}
            </option>
          ))}
        </select>
        <select value={sms} onChange={(e) => setSms(e.target.value as 'telnyx' | 'twilio')}>
          <option value="telnyx">SMS/voice: Telnyx (EU default)</option>
          <option value="twilio">SMS/voice: Twilio</option>
        </select>
        <button
          className="primary"
          disabled={busy}
          onClick={() => run(() => post('/api/agents', { client_id: clientId, template_key: template, sms_provider: sms }))}
        >
          {busy ? 'Generating…' : 'Generate blueprint'}
        </button>
      </div>
      {error && <div className="banner bad" style={{ marginTop: 10 }}>{error}</div>}
    </>
  );
}

export function CredentialToggle({
  agentId, envVar, status,
}: { agentId: string; envVar: string; status: string }) {
  const { busy, error, run } = useAction();
  return (
    <>
      <select
        value={status}
        disabled={busy}
        onChange={(e) => run(() => post(`/api/agents/${agentId}/credentials`, { env_var: envVar, status: e.target.value }))}
      >
        <option value="missing">missing</option>
        <option value="configured">in secret store</option>
        <option value="verified">verified working</option>
      </select>
      {error && <span className="small" style={{ color: 'var(--bad)' }}> {error}</span>}
    </>
  );
}

export function StepTestButtons({
  agentId, stepKey, status,
}: { agentId: string; stepKey: string; status: string }) {
  const { busy, run } = useAction();
  return (
    <div className="row">
      <button
        disabled={busy}
        style={status === 'passed' ? { borderColor: 'var(--good)', color: 'var(--good)' } : undefined}
        onClick={() => run(() => post(`/api/agents/${agentId}/steps`, { step_key: stepKey, passed: true }))}
      >
        pass
      </button>
      <button
        disabled={busy}
        style={status === 'failed' ? { borderColor: 'var(--bad)', color: 'var(--bad)' } : undefined}
        onClick={() => run(() => post(`/api/agents/${agentId}/steps`, { step_key: stepKey, passed: false }))}
      >
        fail
      </button>
    </div>
  );
}

export function GoLiveButton({ agentId, status }: { agentId: string; status: string }) {
  const { busy, error, run } = useAction();
  if (status === 'live') return <span className="pill good">live</span>;
  return (
    <>
      <button className="primary" disabled={busy} onClick={() => run(() => post(`/api/agents/${agentId}/golive`, {}))}>
        {busy ? 'Checking…' : 'Go live'}
      </button>
      {error && <div className="banner bad" style={{ marginTop: 10 }}>{error}</div>}
    </>
  );
}
