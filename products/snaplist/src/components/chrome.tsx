import Link from 'next/link';

export function Nav({ cta = 'Start free' }: { cta?: string }) {
  return (
    <header className="nav">
      <div className="shell nav-inner">
        <Link href="/" className="brand">
          <span className="brand-mark">S</span>
          Snaplist
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
        <span>© {new Date().getFullYear()} Snaplist</span>
        <div className="row" style={{ gap: 18 }}>
          <Link href="/pricing">Pricing</Link>
          <Link href="/account">Account</Link>
          <Link href="/signin">Sign in</Link>
        </div>
      </div>
    </footer>
  );
}
