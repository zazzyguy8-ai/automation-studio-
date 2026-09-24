export const randInt = (min, max) => Math.floor(min + Math.random() * (max - min + 1));
export const randBetween = ([min, max]) => randInt(min, max);

let stopRequested = false;
export const requestStop = () => { stopRequested = true; };
export const isStopRequested = () => stopRequested;

/** Plain delay that Ctrl+C cannot shorten — used while typing/clicking so a stop never speeds things up. */
export const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/** Sleep that wakes up early (within ~1 s) when Ctrl+C was pressed. */
export async function sleep(ms) {
  const end = Date.now() + ms;
  while (!stopRequested && Date.now() < end) {
    await new Promise((r) => setTimeout(r, Math.min(1000, end - Date.now())));
  }
}

export async function pause(ms, label) {
  const s = Math.round(ms / 1000);
  console.log(`⏳ ${label}: ${s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`}`);
  await sleep(ms);
}

export const normalizeHandle = (h) => String(h ?? '').trim().replace(/^@/, '').toLowerCase();
