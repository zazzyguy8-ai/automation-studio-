import { Suspense } from 'react';
import { SetupForm } from '@/components/setup-form';

export const metadata = {
  title: 'Set up a campaign',
  description: 'Tell the engine what you sell and who you want. It does the rest.',
};

export default function SetupPage() {
  return (
    <main className="wrap">
      <header style={{ marginBottom: 32 }}>
        <p className="small muted mono" style={{ textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          Setup
        </p>
        <h1 style={{ margin: '8px 0 12px' }}>What do you sell, and who to?</h1>
        <p className="muted" style={{ maxWidth: '60ch', margin: 0 }}>
          Nine questions. The engine uses them to find companies, read their sites, work out
          what is worth selling them, and draft the message. Nothing sends without you
          approving it first.
        </p>
      </header>
      <Suspense fallback={<p className="muted">Loading…</p>}>
        <SetupForm />
      </Suspense>
    </main>
  );
}
