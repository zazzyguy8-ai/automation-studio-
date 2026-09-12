import type { Metadata } from 'next';
import { Nav } from '@/components/chrome';
import { Studio } from '@/components/studio';
import { currentAccount } from '@/lib/auth';
import { PLANS } from '@/lib/billing/plans';
import { quotaFor, type Quota } from '@/lib/quota';

export const metadata: Metadata = { title: 'Write a listing' };
export const dynamic = 'force-dynamic';

/** A visitor with no account yet has spent nothing; the row is created by
 *  their first listing, not by loading the page. */
const UNTOUCHED: Quota = {
  plan: 'free',
  used: 0,
  limit: PLANS.free.limit,
  remaining: PLANS.free.limit,
  window: 'lifetime',
  allowed: true,
  message: '',
};

export default async function AppPage() {
  const account = await currentAccount();
  const quota = account ? await quotaFor(account) : UNTOUCHED;

  return (
    <>
      <Nav cta="Pricing" />
      <main className="shell" style={{ paddingBlock: 28 }}>
        <div className="stack" style={{ gap: 20 }}>
          <div className="stack" style={{ gap: 6 }}>
            <h2 style={{ fontSize: 26 }}>Write a listing</h2>
            <p className="dim small">
              Photo in, listing out. Nothing is published anywhere — you copy what you want.
            </p>
          </div>
          <Studio quota={quota} signedIn={Boolean(account?.email)} />
        </div>
      </main>
    </>
  );
}
