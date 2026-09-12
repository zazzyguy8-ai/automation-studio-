import type { Metadata } from 'next';
import Link from 'next/link';
import { Footer, Nav } from '@/components/chrome';
import { UpgradeButton } from '@/components/upgrade-button';
import { PLANS, PRICE_ENV } from '@/lib/billing/plans';

export const metadata: Metadata = { title: 'Pricing' };
export const dynamic = 'force-dynamic';

export default function PricingPage() {
  // The annual plan only appears once its price exists in Stripe, so a
  // launch that has only created the monthly one never shows a button that
  // would fail at checkout.
  const yearly = Boolean(process.env[PRICE_ENV.yearly]);

  return (
    <>
      <Nav cta="Start free" />
      <main>
        <section>
          <div className="shell stack" style={{ gap: 34 }}>
            <div className="stack" style={{ gap: 12, maxWidth: 620 }}>
              <span className="eyebrow">Pricing</span>
              <h2>Cheaper than one returned parcel.</h2>
              <p className="lede">
                Five listings free, no card. After that it is seven dollars a month, and you can
                stop it in one click from inside the app.
              </p>
            </div>

            <div className="grid-2">
              <article className="card plan">
                <div className="stack" style={{ gap: 6 }}>
                  <span className="eyebrow">Free</span>
                  <span className="plan-price">$0</span>
                  <p className="dim small">{PLANS.free.limit} listings, then it stops. No card, no email.</p>
                </div>
                <ul>
                  <li>All seven marketplaces</li>
                  <li>Price range and condition grade</li>
                  <li>Up to four photos per item</li>
                </ul>
                <div className="grow" />
                <Link href="/app" className="btn btn-ghost btn-block">Start writing</Link>
              </article>

              <article className="card plan plan-featured">
                <div className="stack" style={{ gap: 6 }}>
                  <span className="eyebrow accent">Pro</span>
                  <span className="plan-price">$7<span style={{ fontSize: 17, color: 'var(--text-dim)' }}> / month</span></span>
                  <p className="dim small">{yearly ? 'Or $69 a year — two months off.' : 'Cancel any time, in one click.'}</p>
                </div>
                <ul>
                  <li>Unlimited listings in practice ({PLANS.pro.limit} a month fair use)</li>
                  <li>Every marketplace, every time — write once, paste everywhere</li>
                  <li>Your listings saved and searchable</li>
                  <li>Cancel in one click, keeps working to the end of the period</li>
                </ul>
                <div className="grow" />
                <div className="stack" style={{ gap: 9 }}>
                  <UpgradeButton interval="monthly">Go Pro — $7/month</UpgradeButton>
                  {yearly && (
                    <UpgradeButton interval="yearly" className="btn btn-ghost btn-block">Pay yearly — $69</UpgradeButton>
                  )}
                </div>
              </article>
            </div>

            <p className="small faint" style={{ maxWidth: 620 }}>
              Payments run through Stripe; no card details ever touch this app. Prices in USD,
              charged in your card&apos;s currency at Stripe&apos;s rate.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
