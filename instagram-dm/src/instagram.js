import { CONFIG } from './config.js';
import { AbortRunError, SkipTargetError } from './errors.js';
import { delay as sleep, randBetween, randInt } from './utils.js';

const BASE = 'https://www.instagram.com';

// Instagram renders UI in the account's language, so match English + Slovak + Czech.
const TEXT = {
  message: /^(message|send message|správa|poslať správu|napísať správu|zpráva|poslat zprávu|napsat zprávu)$/i,
  options: /^(options|možnosti)$/i,
  notNow: /^(not now|teraz nie|teď ne|nyní ne)$/i,
};

/**
 * Anything matching these stops the whole run immediately. Order matters:
 * the first match wins. `where: 'url'` matches page.url(), otherwise visible page text.
 */
const BLOCKERS = [
  { kind: 'verification', where: 'url', re: /\/(challenge|checkpoint|two_factor|accounts\/suspended|accounts\/disabled)/i },
  { kind: 'logged_out', where: 'url', re: /\/accounts\/login/i },
  { kind: 'verification', re: /confirm (it's|that it's) you|help us confirm|verify your (account|identity)|suspicious (login|activity)|potvrďte, že ste to vy|overte svoju totožnosť|we suspended your account/i },
  { kind: 'action_block', re: /try again later|action blocked|we limit how often|restrict certain activity|to protect our community|skúste to znova neskôr|akcia bola zablokovaná|obmedzujeme/i },
  { kind: 'dm_blocked', re: /you can'?t message this account|can'?t send (this )?message|message (wasn'?t|was not|couldn'?t be) sent|not delivered|failed to send|you'?re (temporarily )?(blocked|restricted) from|nemôžete poslať správu|správa nebola odoslaná|nedoručené/i },
];

const PRIVATE_PROFILE = /this account is private|toto konto je súkromné|tento účet je soukromý/i;
const PROFILE_NOT_FOUND = /sorry, this page isn'?t available|táto stránka nie je dostupná|tato stránka není dostupná/i;

async function visibleText(page) {
  try {
    return await page.evaluate(() => document.body?.innerText ?? '');
  } catch {
    return '';
  }
}

/** Throws AbortRunError if Instagram shows a checkpoint, block or logout. */
export async function assertNoBlockers(page) {
  const url = page.url();
  const text = await visibleText(page);
  for (const b of BLOCKERS) {
    const haystack = b.where === 'url' ? url : text;
    const match = haystack.match(b.re);
    if (match) throw new AbortRunError(b.kind, `Instagram: "${match[0]}" (${url})`);
  }
}

async function settle(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await sleep(randInt(1500, 3500));
}

async function dismissNotNow(page) {
  const btn = page.getByRole('button', { name: TEXT.notNow }).first();
  if (await btn.isVisible().catch(() => false)) {
    await sleep(randInt(600, 1400));
    await btn.click();
    await sleep(randInt(500, 1200));
  }
}

export async function assertLoggedIn(page) {
  await page.goto(`${BASE}/`);
  await settle(page);
  await assertNoBlockers(page);
  const cookies = await page.context().cookies(BASE);
  if (!cookies.some((c) => c.name === 'sessionid' && c.value)) {
    throw new AbortRunError('logged_out', 'Session vypršala. Spusti znova: npm run login');
  }
  await dismissNotNow(page);
}

export async function openProfile(page, handle) {
  const res = await page.goto(`${BASE}/${encodeURIComponent(handle)}/`);
  await settle(page);
  await assertNoBlockers(page);
  const text = await visibleText(page);
  if (res?.status() === 404 || PROFILE_NOT_FOUND.test(text)) {
    throw new SkipTargetError('profil neexistuje');
  }
  if (PRIVATE_PROFILE.test(text)) {
    throw new AbortRunError('private_profile', `Profil @${handle} je súkromný (uzavretý).`);
  }
}

/** Clicks "Message" on the profile (or Options → Send message) and waits for the composer. */
export async function openThread(page, handle) {
  let button = page.getByRole('button', { name: TEXT.message }).first();
  if (!(await button.isVisible().catch(() => false))) {
    const options = page.locator('svg[aria-label="Options"], svg[aria-label="Možnosti"]').first();
    if (await options.isVisible().catch(() => false)) {
      await options.click();
      await sleep(randInt(700, 1500));
      button = page.getByRole('dialog').getByRole('button', { name: TEXT.message }).first();
    }
  }
  if (!(await button.isVisible().catch(() => false))) {
    await page.keyboard.press('Escape').catch(() => {});
    throw new SkipTargetError(`na profile @${handle} nie je tlačidlo na správu`);
  }

  await button.hover();
  await sleep(randInt(300, 900));
  await button.click();
  await sleep(randInt(2500, 4500));
  await dismissNotNow(page);
  await assertNoBlockers(page);

  const composer = composerLocator(page);
  try {
    await composer.waitFor({ state: 'visible', timeout: 20_000 });
  } catch {
    await assertNoBlockers(page);
    throw new Error('nepodarilo sa otvoriť okno konverzácie');
  }
  return composer;
}

const composerLocator = (page) => page.locator('div[role="textbox"][contenteditable="true"]').last();

/** Types character by character with random delays. Newlines use Shift+Enter (Enter would send). */
export async function typeLikeHuman(page, composer, text) {
  await composer.click();
  await sleep(randInt(500, 1200));
  const [min, max] = CONFIG.typingDelayMs;
  for (const ch of text) {
    if (ch === '\n') await page.keyboard.press('Shift+Enter');
    else await page.keyboard.type(ch);

    let delay = randInt(min, max);
    if (/[ ,.!?]/.test(ch)) delay += randInt(30, 150);
    if (Math.random() < CONFIG.thinkingPauseChance) delay += randBetween(CONFIG.thinkingPauseMs);
    await sleep(delay);
  }
}

export async function clearComposer(page, composer) {
  await composer.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
}

/** Presses Enter, waits for the composer to empty, then re-checks for any block message. */
export async function sendAndVerify(page, composer) {
  await sleep(randInt(800, 2000));
  await page.keyboard.press('Enter');

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const left = (await composer.innerText().catch(() => '')).trim();
    if (!left) break;
    await sleep(500);
  }
  await sleep(randInt(2500, 4000));
  await assertNoBlockers(page);

  const left = (await composer.innerText().catch(() => '')).trim();
  if (left) throw new Error('správa zostala v poli na písanie – odoslanie nepotvrdené');
}
