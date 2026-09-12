'use client';

import { useState } from 'react';

/** Starts checkout. The plan is not changed here - Stripe's webhook does
 *  that - so this only ever navigates. */
export function UpgradeButton({ interval, children, className = 'btn btn-primary btn-block' }: {
  interval: 'monthly' | 'yearly';
  children: React.ReactNode;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ interval }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.url) {
        setError(payload.error ?? 'Checkout could not be started.');
        return;
      }
      window.location.href = payload.url;
    } catch {
      setError('Checkout could not be reached.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <button type="button" className={className} onClick={go} disabled={busy}>
        {busy ? 'Opening Stripe…' : children}
      </button>
      {error && <p className="error small">{error}</p>}
    </div>
  );
}

/** Cancel, card changes and invoices all live in Stripe's portal. */
export function PortalButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/billing/portal', { method: 'POST' });
      const payload = await response.json();
      if (!response.ok || !payload.url) {
        setError(payload.error ?? 'The billing portal could not be opened.');
        return;
      }
      window.location.href = payload.url;
    } catch {
      setError('The billing portal could not be reached.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <button type="button" className="btn btn-ghost" onClick={go} disabled={busy}>
        {busy ? 'Opening…' : 'Manage billing'}
      </button>
      {error && <p className="error small">{error}</p>}
    </div>
  );
}
