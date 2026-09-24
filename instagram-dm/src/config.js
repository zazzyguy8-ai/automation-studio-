import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const CONFIG = {
  root: ROOT,
  targetsFile: path.join(ROOT, 'targets.json'),
  logFile: path.join(ROOT, 'sent.log'),
  storageStateFile: path.join(ROOT, 'auth', 'storageState.json'),
  screenshotsDir: path.join(ROOT, 'screenshots'),

  // Sent to every target that has no "message" of its own in targets.json.
  defaultMessage: 'hey i love your vids keep it up!',

  // Hard safety limits. The CLI can lower maxMessagesPerRun, never raise it.
  maxMessagesPerRun: 30,
  pauseBetweenMessagesMs: [90_000, 180_000],
  batchSize: 5,
  batchPauseMs: 5 * 60_000,
  // Shorter pause after a skipped/failed profile visit — it is still activity.
  pauseAfterSkipMs: [30_000, 60_000],
  maxConsecutiveFailures: 3,

  // Per-keystroke delay, plus occasional longer "thinking" pauses.
  typingDelayMs: [60, 190],
  thinkingPauseChance: 0.04,
  thinkingPauseMs: [400, 1300],

  loginTimeoutMs: 10 * 60_000,
  navigationTimeoutMs: 30_000,
  viewport: { width: 1280, height: 820 },

  // Optional: POST a JSON alert here (Slack/Discord/ntfy webhook) when a run aborts.
  alertWebhookUrl: process.env.ALERT_WEBHOOK_URL || '',
  // Optional: 'chrome' uses your installed Google Chrome instead of bundled Chromium.
  browserChannel: process.env.BROWSER_CHANNEL || undefined,
};
