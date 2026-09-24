import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { CONFIG } from './config.js';

/**
 * Same browser, viewport and locale for login and sending, so the saved session
 * is always replayed from a consistent-looking browser.
 */
export async function launch({ headless, useStorageState }) {
  if (useStorageState && !fs.existsSync(CONFIG.storageStateFile)) {
    throw new Error('Chýba uložená session. Najprv spusti: npm run login');
  }
  const browser = await chromium.launch({ headless, channel: CONFIG.browserChannel });
  const context = await browser.newContext({
    viewport: CONFIG.viewport,
    storageState: useStorageState ? CONFIG.storageStateFile : undefined,
  });
  context.setDefaultNavigationTimeout(CONFIG.navigationTimeoutMs);
  const page = await context.newPage();
  return { browser, context, page };
}

export async function saveStorageState(context) {
  fs.mkdirSync(path.dirname(CONFIG.storageStateFile), { recursive: true });
  await context.storageState({ path: CONFIG.storageStateFile });
  // The file contains live session cookies — keep it private to this user.
  fs.chmodSync(CONFIG.storageStateFile, 0o600);
}

export async function screenshot(page, name) {
  try {
    fs.mkdirSync(CONFIG.screenshotsDir, { recursive: true });
    const file = path.join(CONFIG.screenshotsDir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    return file;
  } catch {
    return null;
  }
}
