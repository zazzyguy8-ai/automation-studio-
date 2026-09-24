import { CONFIG } from './config.js';
import { launch, saveStorageState } from './browser.js';
import { delay as sleep } from './utils.js';

const LOGIN_URL = 'https://www.instagram.com/accounts/login/';
const NOT_DONE_URL = /\/(accounts\/login|challenge|checkpoint|two_factor|accounts\/onetap)/;

const { browser, context, page } = await launch({ headless: false, useStorageState: false });

console.log('🔐 Otvorené okno prehliadača. Prihlás sa do Instagramu ručne');
console.log('   (vrátane 2FA / overenia, ak ho Instagram vyžiada).');
console.log(`   Čakám max ${CONFIG.loginTimeoutMs / 60_000} minút. Okno NEZATVÁRAJ.\n`);

try {
  await page.goto(LOGIN_URL);
  const deadline = Date.now() + CONFIG.loginTimeoutMs;
  let loggedIn = false;
  while (Date.now() < deadline) {
    if (page.isClosed()) throw new Error('Okno prehliadača bolo zatvorené pred dokončením prihlásenia.');
    const cookies = await context.cookies('https://www.instagram.com');
    const hasSession = cookies.some((c) => c.name === 'sessionid' && c.value);
    if (hasSession && !NOT_DONE_URL.test(page.url())) {
      loggedIn = true;
      break;
    }
    await sleep(2000);
  }
  if (!loggedIn) throw new Error('Prihlásenie nebolo dokončené v časovom limite.');

  // Let Instagram finish setting its remaining cookies before saving.
  await sleep(5000);
  await saveStorageState(context);
  console.log(`✅ Prihlásenie uložené do ${CONFIG.storageStateFile}`);
  console.log('   Teraz môžeš spustiť: npm run send:dry  (test) alebo  npm run send');
} catch (e) {
  console.error(`❌ ${e.message}`);
  process.exitCode = 1;
} finally {
  await browser.close().catch(() => {});
}
