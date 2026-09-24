import { CONFIG } from './config.js';

const REASONS = {
  verification: 'Instagram vyžaduje overenie (checkpoint / 2FA / potvrdenie identity).',
  logged_out: 'Session vypršala alebo ťa Instagram odhlásil.',
  action_block: 'Instagram obmedzil aktivitu účtu (action block / "Try again later").',
  dm_blocked: 'Odosielanie správ je zablokované alebo správa nebola doručená.',
  private_profile: 'Narazil som na súkromný (uzavretý) profil.',
  too_many_failures: 'Príliš veľa zlyhaní po sebe – niečo nie je v poriadku.',
};

/** Loud terminal alert + optional webhook. Never throws. */
export async function alertUser(kind, message, screenshotPath) {
  const reason = REASONS[kind] ?? 'Neznámy problém.';
  const lines = [
    '',
    '\x07🛑🛑🛑 BEH BOL BEZPEČNE UKONČENÝ 🛑🛑🛑',
    `Dôvod:   ${reason}`,
    `Detail:  ${message}`,
    screenshotPath ? `Snímka:  ${screenshotPath}` : null,
    'Odporúčanie: skontroluj účet ručne v appke/prehliadači a nepokračuj aspoň 24–48 h.',
    '',
  ].filter((l) => l !== null);
  console.error(`\x1b[31m${lines.join('\n')}\x1b[0m`);

  if (!CONFIG.alertWebhookUrl) return;
  try {
    const text = `Instagram DM bot zastavený: ${reason} ${message}`;
    // `text` for Slack, `content` for Discord; ntfy.sh accepts any body.
    await fetch(CONFIG.alertWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, content: text, kind }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    console.error(`(webhook upozornenie zlyhalo: ${e.message})`);
  }
}
