import Link from 'next/link';
import { Footer, Nav } from '@/components/chrome';
import { PLANS } from '@/lib/billing/plans';

/**
 * The landing page, written for one person: somebody who sells second-hand
 * and already knows listing is the boring part. It does not explain AI, it
 * shows the output, because the output is the argument.
 */

const PROBLEMS = [
  {
    title: 'eBay cuts your title at 80 characters',
    body: 'Usually mid-word, usually taking the size with it. Pricebird writes a title per marketplace and enforces each limit before you paste, so nothing gets chopped.',
  },
  {
    title: 'The flaw you forgot becomes a refund',
    body: 'Buyers forgive wear they were told about and open a case over wear they discover. Every scuff, bobble and missing button in the photo goes in the description.',
  },
  {
    title: 'Guessing the price costs more than the fee',
    body: 'You get a range: what it sells for this week, what it sells for with patience, and the reasoning in plain words so you can overrule it.',
  },
];

const STEPS = [
  { n: 1, title: 'Photograph the item', body: 'One photo is enough. Add the label and any damage and the listing gets sharper.' },
  { n: 2, title: 'Pick the marketplace', body: 'eBay, Vinted, Depop, Facebook, Poshmark, Mercari or Etsy. Each gets its own title and voice.' },
  { n: 3, title: 'Copy and paste', body: 'Title, description, keywords, price. Around twenty seconds from photo to listed.' },
];

const HONESTY = [
  ['It will not invent a size.', 'If the label is not readable in the photo, the size comes back empty and you get asked for it. A made-up size is a return.'],
  ['It will not pretend to check sold listings.', 'The price is an estimate from the photo and typical resale bands, and it says so. Anything else would be a lie with a number on it.'],
  ['It will not keep your photos.', 'The image is read and dropped. Only the text of the listing is stored, so you can reopen it on your laptop.'],
];

const FAQ = [
  ['Do I need an account to try it?', 'No. Five listings, no email, no card. The account only appears if you want your listings on another device or you go Pro.'],
  ['Which marketplaces does it write for?', 'eBay, Vinted, Depop, Facebook Marketplace, Poshmark, Mercari and Etsy. Each has its own title limit, tone and hashtag rules, and each gets its own version.'],
  ['Does it post the listing for me?', 'No, and that is deliberate. You copy and paste. Nothing gets published in your name by a machine that has never seen the item in person.'],
  ['What if the description is wrong?', 'Edit it. It is text in a box. The point is starting from something 90% right instead of an empty field at eleven at night.'],
  ['Can I cancel?', 'One click in the billing portal, and it keeps working until the period you paid for ends.'],
];

export default function Home() {
  return (
    <>
      <Nav />

      <main>
        <section className="hero">
          <div className="shell">
            <div className="grid-2" style={{ gap: 40, alignItems: 'center' }}>
              <div className="stack" style={{ gap: 22 }}>
                <span className="pill pill-accent">5 free · no signup</span>
                <h1>What&apos;s it worth?<br /><span>Ask the bird.</span></h1>
                <p className="lede">
                  Photograph anything you are selling. Pricebird reads the photo and gives you a
                  price range — plus the title, the description and the search keywords, sized for
                  whichever marketplace you list on.
                </p>
                <div className="row">
                  <Link href="/app" className="btn btn-primary">Price something free</Link>
                  <Link href="/pricing" className="btn btn-ghost">See pricing</Link>
                </div>
                <p className="small faint">About twenty seconds. No card, no email until you want one.</p>
              </div>

              <ExampleCard />
            </div>
          </div>
        </section>

        <section className="section-tight">
          <div className="shell stack" style={{ gap: 12 }}>
            <span className="eyebrow">Writes for</span>
            <div className="chip-list">
              {['eBay', 'Vinted', 'Depop', 'Facebook Marketplace', 'Poshmark', 'Mercari', 'Etsy'].map((p) => (
                <span key={p} className="chip">{p}</span>
              ))}
            </div>
          </div>
        </section>

        <section>
          <div className="shell stack" style={{ gap: 28 }}>
            <div className="stack" style={{ gap: 10, maxWidth: 620 }}>
              <span className="eyebrow">Why bother</span>
              <h2>Listing is not the hard part. Listing badly is.</h2>
            </div>
            <div className="grid-3">
              {PROBLEMS.map((p) => (
                <article key={p.title} className="card stack" style={{ gap: 9 }}>
                  <h3>{p.title}</h3>
                  <p className="dim small" style={{ fontSize: 14.5 }}>{p.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section style={{ background: 'var(--surface)', borderBlock: '1px solid var(--line)' }}>
          <div className="shell stack" style={{ gap: 28 }}>
            <div className="stack" style={{ gap: 10, maxWidth: 620 }}>
              <span className="eyebrow">How it works</span>
              <h2>Three steps, one of which is taking a photo.</h2>
            </div>
            <div className="grid-3">
              {STEPS.map((s) => (
                <article key={s.n} className="stack" style={{ gap: 10 }}>
                  <span className="step-n">{s.n}</span>
                  <h3>{s.title}</h3>
                  <p className="dim" style={{ fontSize: 14.5 }}>{s.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section>
          <div className="shell stack" style={{ gap: 26 }}>
            <div className="stack" style={{ gap: 10, maxWidth: 640 }}>
              <span className="eyebrow">The honest part</span>
              <h2>Three things it refuses to do.</h2>
              <p className="lede">
                Every one of them would make the demo look better and the listing worse.
              </p>
            </div>
            <div className="grid-3">
              {HONESTY.map(([title, body]) => (
                <article key={title} className="card stack" style={{ gap: 9 }}>
                  <h3>{title}</h3>
                  <p className="dim" style={{ fontSize: 14.5 }}>{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section style={{ background: 'var(--surface)', borderBlock: '1px solid var(--line)' }}>
          <div className="shell stack" style={{ gap: 20, alignItems: 'center', textAlign: 'center' }}>
            <span className="eyebrow">Pricing</span>
            <h2>{PLANS.pro.priceLabel.replace(' / month', '')} a month. One extra sale covers the year.</h2>
            <p className="lede" style={{ maxWidth: 560 }}>
              Five listings free to decide. Then unlimited listings, every marketplace, cancel in a click.
            </p>
            <div className="row" style={{ justifyContent: 'center' }}>
              <Link href="/app" className="btn btn-primary">Start with 5 free</Link>
              <Link href="/pricing" className="btn btn-ghost">Full pricing</Link>
            </div>
          </div>
        </section>

        <section>
          <div className="shell" style={{ maxWidth: 760 }}>
            <h2 style={{ marginBottom: 24 }}>Questions</h2>
            {FAQ.map(([q, a]) => (
              <div key={q} className="faq">
                <h3>{q}</h3>
                <p className="dim" style={{ fontSize: 15 }}>{a}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}

/**
 * A worked example, not a screenshot.
 *
 * Real markup so it stays sharp on every screen and keeps working when the
 * output format changes - and so a visitor on a phone sees the actual product
 * surface rather than a shrunken picture of it.
 */
function ExampleCard() {
  return (
    <div className="card stack" style={{ gap: 14 }}>
      <div className="spread">
        <span className="pill">eBay · 80 char limit</span>
        <span className="pill pill-accent">from 1 photo</span>
      </div>

      <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
        <div className="stack" style={{ gap: 2, flex: 1 }}>
          <span className="out-label">Suggested price</span>
          <div className="price-row">
            <span className="price-big">£95</span>
            <span className="price-range">£78 quick · £120 patient</span>
          </div>
        </div>
      </div>
      <div className="out-field">
        <div className="out-head">
          <span className="out-label">Title · 74/80</span>
          <span className="btn-quiet" aria-hidden="true">Copy</span>
        </div>
        <div className="out-body">Carhartt WIP Detroit Jacket Brown Corduroy Collar Duck Canvas Mens Size L</div>
      </div>

      <div className="out-field">
        <div className="out-head">
          <span className="out-label">Description</span>
          <span className="btn-quiet" aria-hidden="true">Copy</span>
        </div>
        <div className="out-body" style={{ fontSize: 14.5 }}>
          Carhartt WIP Detroit jacket in brown duck canvas with the corduroy collar. Blanket lining,
          front hand-warmer pockets, chest pocket, all zips and snaps working.{'\n\n'}
          Worn, and it looks it: fading at the cuffs and elbows, one small paint mark on the left
          sleeve shown in the photos. No rips, no smell, no repairs.
        </div>
      </div>


      <p className="note note-warn small">
        Size read off the label in photo 2. Chest measurement not visible — measure pit to pit
        before you list, it is the first thing buyers ask.
      </p>
    </div>
  );
}
