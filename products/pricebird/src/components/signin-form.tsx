'use client';

import { useState } from 'react';

/**
 * Sign-in in two steps and no password.
 *
 * The address is asked for once, a six-digit code arrives, and that is the
 * account. There is nothing to reset, nothing to leak, and no signup form
 * standing between a visitor and their first listing - by the time anyone sees
 * this page they have already used the product.
 */
export function SignInForm() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(path: string, body: unknown): Promise<{ ok: boolean; payload: { error?: string } }> {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { ok: response.ok, payload: await response.json().catch(() => ({})) };
  }

  async function requestCode() {
    setBusy(true);
    setError(null);
    const { ok, payload } = await post('/api/auth/request', { email: email.trim() });
    setBusy(false);
    if (!ok) { setError(payload.error ?? 'The code could not be sent.'); return; }
    setStage('code');
  }

  async function verify() {
    setBusy(true);
    setError(null);
    const { ok, payload } = await post('/api/auth/verify', { email: email.trim(), code: code.trim() });
    setBusy(false);
    if (!ok) { setError(payload.error ?? 'That code did not work.'); return; }
    window.location.href = '/app';
  }

  return (
    <div className="card stack" style={{ gap: 14, maxWidth: 420 }}>
      {stage === 'email' ? (
        <>
          <div className="field">
            <label className="field-label" htmlFor="email">Your email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              placeholder="you@example.com"
              onChange={(event) => setEmail(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter' && email.includes('@')) void requestCode(); }}
            />
          </div>
          <button type="button" className="btn btn-primary btn-block" disabled={busy || !email.includes('@')} onClick={requestCode}>
            {busy ? 'Sending…' : 'Send me a code'}
          </button>
        </>
      ) : (
        <>
          <p className="small dim">A six-digit code is on its way to {email}. It works for ten minutes.</p>
          <div className="field">
            <label className="field-label" htmlFor="code">Code</label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              placeholder="000000"
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              onKeyDown={(event) => { if (event.key === 'Enter' && code.length === 6) void verify(); }}
            />
          </div>
          <button type="button" className="btn btn-primary btn-block" disabled={busy || code.length !== 6} onClick={verify}>
            {busy ? 'Checking…' : 'Sign in'}
          </button>
          <button type="button" className="btn-quiet" onClick={() => { setStage('email'); setCode(''); setError(null); }}>
            Use a different address
          </button>
        </>
      )}
      {error && <p className="error small">{error}</p>}
    </div>
  );
}
