import type { Metadata } from 'next';
import { Footer, Nav } from '@/components/chrome';
import { SignInForm } from '@/components/signin-form';

export const metadata: Metadata = { title: 'Sign in' };

export default function SignInPage() {
  return (
    <>
      <Nav cta="Start free" />
      <main className="shell" style={{ paddingBlock: 56 }}>
        <div className="stack" style={{ gap: 20, maxWidth: 480 }}>
          <div className="stack" style={{ gap: 8 }}>
            <h2 style={{ fontSize: 30 }}>Sign in</h2>
            <p className="dim">
              No password. Put in your email, get a code. If you have listings in this browser
              already, they come with you.
            </p>
          </div>
          <SignInForm />
        </div>
      </main>
      <Footer />
    </>
  );
}
