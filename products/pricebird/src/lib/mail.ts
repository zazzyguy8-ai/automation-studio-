/**
 * Outbound email: one message, the sign-in code.
 *
 * Resend over fetch rather than a client library - one endpoint does not earn
 * a dependency. When no key is configured the code is written to the server
 * log instead, which is what makes `npm run dev` work on a laptop with no
 * accounts set up anywhere. That fallback refuses to run in production,
 * because a sign-in code printed to a log nobody reads is an account nobody
 * can get into.
 */

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export function mailConfigProblems(): string[] {
  const problems: string[] = [];
  if (!process.env.RESEND_API_KEY) problems.push('RESEND_API_KEY is not set - sign-in codes cannot be emailed.');
  if (!process.env.MAIL_FROM) problems.push('MAIL_FROM is not set - Resend rejects a send with no verified sender.');
  return problems;
}

export async function sendMail(mail: Mail): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;

  if (!key || !from) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(mailConfigProblems().join(' '));
    }
    console.info(`\n[mail:dev] to=${mail.to}\n[mail:dev] ${mail.subject}\n${mail.text}\n`);
    return;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text }),
  });

  if (!response.ok) {
    throw new Error(`Resend refused the send (${response.status}): ${(await response.text()).slice(0, 300)}`);
  }
}
