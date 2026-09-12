import { NextResponse } from 'next/server';
import { z } from 'zod';
import { codeExpiry, generateCode, hashCode } from '@/lib/auth';
import { getStore } from '@/lib/db';
import { sendMail } from '@/lib/mail';

export const runtime = 'nodejs';

const BodySchema = z.object({ email: z.string().email().max(200) });

export async function POST(request: Request) {
  let email: string;
  try {
    email = BodySchema.parse(await request.json()).email.trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: 'That is not an email address.' }, { status: 400 });
  }

  const code = generateCode();
  const store = await getStore();
  await store.putLoginCode({ email, code_hash: hashCode(email, code), expires_at: codeExpiry(), attempts: 0 });

  try {
    await sendMail({
      to: email,
      subject: `${code} is your Snaplist code`,
      text: `Your sign-in code is ${code}.\n\nIt works for ten minutes. If you did not ask for it, ignore this email — nobody can get into your listings without it.`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'The code could not be sent.' },
      { status: 502 },
    );
  }

  // Always the same answer, whether or not that address has an account. The
  // sign-in form must not become a way to ask who is a customer.
  return NextResponse.json({ sent: true });
}
