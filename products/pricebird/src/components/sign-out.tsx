'use client';

export function SignOutButton() {
  return (
    <button
      type="button"
      className="btn-quiet"
      onClick={async () => {
        await fetch('/api/auth/signout', { method: 'POST' });
        window.location.href = '/';
      }}
    >
      Sign out
    </button>
  );
}
