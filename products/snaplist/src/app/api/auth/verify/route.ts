import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  SESSION_COOKIE, accountForRequest, checkCode, claimEmail, issueSession, sessionCookieOptions,
} from '@/lib/auth';

export const runtime = 'nodejs';

const BodySchema = z.object({ email: z.string().email().max(200), code: z.string().length(6) });

const REASONS: Record<string, string> = {
  none: 'No code was requested for that address, or it has already been used.',
  expired: 'That code has expired. Ask for a new one.',
  wrong: 'That code is not right.',
  locked: 'Too many wrong attempts. Ask for a new code.',
};

export async function POST(request: Request) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Enter the six-digit code from the email.' }, { status: 400 });
  }

  const check = await checkCode(body.email, body.code);
  if (!check.ok) return NextResponse.json({ error: REASONS[check.reason] }, { status: 401 });

  // The visitor may already be carrying an anonymous account with listings on
  // it; claimEmail decides whether that account gets the email or whether an
  // older account already owns it and the session should move there.
  const { account } = await accountForRequest();
  const signedIn = await claimEmail(account.id, body.email);

  const response = NextResponse.json({ ok: true, plan: signedIn.plan });
  response.cookies.set(SESSION_COOKIE, issueSession(signedIn.id), sessionCookieOptions);
  return response;
}
