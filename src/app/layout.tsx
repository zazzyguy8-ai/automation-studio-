import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Automation Studio',
  description: 'Internal AI automation agency OS',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <aside className="side">
            <h1>Automation Studio</h1>
            <span className="tag">internal agency OS</span>
            <nav>
              <a href="/">Run an audit</a>
              <a href="/leads">Leads</a>
              <a href="/clients">Clients</a>
              <a href="/agents">Agents</a>
            </nav>
          </aside>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
