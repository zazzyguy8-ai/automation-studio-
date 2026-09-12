import Link from 'next/link';

/**
 * The bird.
 *
 * A mascot is not decoration here, it is the brand's face - and the point of
 * having one is that it is not the founder's face. Every piece of marketing
 * this product gets is a silent screen recording, so the thing a viewer
 * recognises on the third video has to live inside the app, not in front of a
 * camera.
 *
 * Built from primitives rather than one clever path: it has to stay readable
 * at 22px in a nav bar and at 96px on a landing page, and a silhouette that
 * survives both is worth more than a detailed one that survives neither.
 */
export function BirdMark({ size = 26 }: { size?: number }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size, borderRadius: size / 3.2 }}>
      <svg viewBox="0 0 24 24" width={size * 0.72} height={size * 0.72} aria-hidden="true" focusable="false">
        {/* forked tail: two feathers, so it does not read as a fin at 26px */}
        <path d="M8.4 12.4 L0.9 7.4 L3.4 12.6 L1.6 17.8 Z" fill="currentColor" />
        {/* body */}
        <ellipse cx="11.6" cy="14" rx="6.2" ry="5.1" fill="currentColor" />
        {/* head */}
        <circle cx="15.7" cy="8.7" r="4" fill="currentColor" />
        {/* beak */}
        <path d="M19.2 7.5 L23.7 9.1 L19.2 10.7 Z" fill="currentColor" />
        {/* wing, cut back out of the silhouette rather than drawn on top */}
        <path d="M9 13.1 Q12.8 14.1 14.8 17.6" stroke="var(--accent)" strokeWidth="0.95" fill="none" strokeLinecap="round" />
        {/* eye, punched out of the head so it reads at any size */}
        <circle cx="16.9" cy="7.8" r="0.92" fill="var(--accent)" />
      </svg>
    </span>
  );
}

export function Nav({ cta = 'Start free' }: { cta?: string }) {
  return (
    <header className="nav">
      <div className="shell nav-inner">
        <Link href="/" className="brand">
          <BirdMark />
          Pricebird
        </Link>
        <nav className="nav-links">
          <Link href="/pricing" className="hide-sm">Pricing</Link>
          <Link href="/signin" className="hide-sm">Sign in</Link>
          <Link href="/app" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: 14 }}>{cta}</Link>
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="shell spread">
        <span>© {new Date().getFullYear()} Pricebird</span>
        <div className="row" style={{ gap: 18 }}>
          <Link href="/pricing">Pricing</Link>
          <Link href="/account">Account</Link>
          <Link href="/signin">Sign in</Link>
        </div>
      </div>
    </footer>
  );
}
