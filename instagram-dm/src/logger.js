import fs from 'node:fs';
import { CONFIG } from './config.js';

export const STATUS = {
  SENT: 'SENT',       // odoslané
  SKIPPED: 'SKIPPED', // preskočené
  FAILED: 'FAILED',   // zlyhalo
  ABORTED: 'ABORTED', // beh bol bezpečne ukončený
};

const clean = (s) => String(s ?? '').replace(/[\t\r\n]+/g, ' ').trim();

/** One tab-separated line per event: ISO time, status, handle, detail. */
export function logStatus(status, handle, detail = '') {
  const line = [new Date().toISOString(), status, clean(handle) || '-', clean(detail)].join('\t');
  fs.appendFileSync(CONFIG.logFile, line + '\n');
  const icon = { SENT: '✅', SKIPPED: '⏭️ ', FAILED: '❌', ABORTED: '🛑' }[status] ?? '•';
  console.log(`${icon} ${status.padEnd(7)} @${clean(handle)} ${detail ? `— ${clean(detail)}` : ''}`);
}

/** Handles that already got a message in any previous run — never message them twice. */
export function readAlreadySent() {
  if (!fs.existsSync(CONFIG.logFile)) return new Set();
  const sent = new Set();
  for (const line of fs.readFileSync(CONFIG.logFile, 'utf8').split('\n')) {
    const [, status, handle] = line.split('\t');
    if (status === STATUS.SENT && handle) sent.add(handle.toLowerCase());
  }
  return sent;
}
