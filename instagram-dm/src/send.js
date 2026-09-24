import { CONFIG } from './config.js';
import { launch, saveStorageState, screenshot } from './browser.js';
import { AbortRunError, SkipTargetError } from './errors.js';
import { alertUser } from './notify.js';
import { logStatus, readAlreadySent, STATUS } from './logger.js';
import { loadTargets } from './targets.js';
import { isStopRequested, pause, randBetween, requestStop } from './utils.js';
import {
  assertLoggedIn, clearComposer, openProfile, openThread, sendAndVerify, typeLikeHuman,
} from './instagram.js';

function parseArgs(argv) {
  const args = { dryRun: false, headless: false, limit: CONFIG.maxMessagesPerRun };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--headless') args.headless = true;
    else if (a === '--limit') args.limit = Number(argv[++i]);
    else throw new Error(`Neznámy parameter: ${a}`);
  }
  if (!Number.isInteger(args.limit) || args.limit < 1) throw new Error('--limit musí byť kladné celé číslo');
  args.limit = Math.min(args.limit, CONFIG.maxMessagesPerRun);
  return args;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const { targets, errors } = loadTargets();
  errors.forEach((e) => console.log(`⚠️  targets.json ${e}`));

  const alreadySent = readAlreadySent();
  const queue = [];
  for (const t of targets) {
    if (alreadySent.has(t.handle)) console.log(`⏭️  @${t.handle} — už odoslané v minulom behu`);
    else queue.push(t);
  }
  if (!queue.length) return console.log('Nie je komu písať – všetky ciele sú už odoslané.');

  console.log(`▶ ${queue.length} v rade, limit tohto behu: ${args.limit}${args.dryRun ? ' (DRY RUN – nič sa neodošle)' : ''}`);

  const { browser, context, page } = await launch({ headless: args.headless, useStorageState: true });
  let sent = 0;
  let consecutiveFailures = 0;
  let aborted = false;

  try {
    await assertLoggedIn(page);

    for (let i = 0; i < queue.length && sent < args.limit && !isStopRequested(); i++) {
      const { handle, message } = queue[i];
      console.log(`\n[${sent + 1}/${args.limit}] @${handle}`);
      let outcome;
      try {
        await openProfile(page, handle);
        const composer = await openThread(page, handle);
        await typeLikeHuman(page, composer, message);
        if (args.dryRun) {
          await clearComposer(page, composer);
          logStatus(STATUS.SKIPPED, handle, 'dry-run: napísané, neodoslané');
        } else {
          await sendAndVerify(page, composer);
          logStatus(STATUS.SENT, handle);
        }
        sent++;
        consecutiveFailures = 0;
        outcome = 'done';
      } catch (e) {
        if (e instanceof AbortRunError) throw e;
        if (e instanceof SkipTargetError) {
          logStatus(STATUS.SKIPPED, handle, e.message);
          outcome = 'skipped';
        } else {
          const shot = await screenshot(page, `failed-${handle}`);
          logStatus(STATUS.FAILED, handle, `${e.message}${shot ? ` [${shot}]` : ''}`);
          outcome = 'failed';
          if (++consecutiveFailures >= CONFIG.maxConsecutiveFailures) {
            throw new AbortRunError('too_many_failures', `${consecutiveFailures} zlyhania po sebe, posledné: ${e.message}`);
          }
        }
      }

      const hasMore = i < queue.length - 1 && sent < args.limit;
      if (!hasMore || isStopRequested()) break;
      if (outcome === 'done') {
        await pause(randBetween(CONFIG.pauseBetweenMessagesMs), 'Pauza pred ďalšou správou');
        if (sent % CONFIG.batchSize === 0) {
          await pause(CONFIG.batchPauseMs, `Dlhá pauza po ${CONFIG.batchSize} správach`);
        }
      } else {
        await pause(randBetween(CONFIG.pauseAfterSkipMs), 'Krátka pauza po preskočení/zlyhaní');
      }
    }

    // Refresh cookies so the session lasts longer — only after a clean run.
    await saveStorageState(context);
  } catch (e) {
    aborted = true;
    if (e instanceof AbortRunError) {
      const shot = await screenshot(page, `abort-${e.kind}`);
      logStatus(STATUS.ABORTED, '-', `${e.kind}: ${e.message}`);
      await alertUser(e.kind, e.message, shot);
    } else {
      throw e;
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const verb = args.dryRun ? 'napísaných (neodoslaných)' : 'odoslaných';
  console.log(`\n${aborted ? '🛑 Ukončené predčasne.' : isStopRequested() ? '⏹  Zastavené používateľom.' : '🏁 Hotovo.'} ${sent} ${verb}. Log: ${CONFIG.logFile}`);
  if (aborted) process.exitCode = 2;
}

process.on('SIGINT', () => {
  if (isStopRequested()) process.exit(130);
  console.log('\n⏹  Zastavujem po aktuálnom kroku… (Ctrl+C znova = okamžite)');
  requestStop();
});

run().catch((e) => {
  console.error(`❌ ${e.message}`);
  process.exitCode = 1;
});
