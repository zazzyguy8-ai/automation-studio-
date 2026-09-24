import fs from 'node:fs';
import { CONFIG } from './config.js';
import { normalizeHandle } from './utils.js';

const HANDLE_RE = /^[a-z0-9._]{1,30}$/;
const MAX_MESSAGE_LENGTH = 1000;

/** Loads targets.json and returns { targets, errors }. Duplicate handles keep the first entry. */
export function loadTargets(file = CONFIG.targetsFile) {
  if (!fs.existsSync(file)) {
    throw new Error(`Súbor ${file} neexistuje. Skopíruj targets.example.json do targets.json.`);
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    throw new Error(`targets.json nie je platný JSON: ${e.message}`);
  }
  if (!Array.isArray(data)) throw new Error('targets.json musí byť pole objektov { handle, message }.');

  const targets = [];
  const errors = [];
  const seen = new Set();
  data.forEach((item, i) => {
    const handle = normalizeHandle(item?.handle);
    const message = typeof item?.message === 'string' ? item.message.replace(/\r\n/g, '\n').trim() : '';
    if (!HANDLE_RE.test(handle)) return errors.push(`#${i}: neplatný handle "${item?.handle}"`);
    if (!message) return errors.push(`#${i} @${handle}: prázdna správa`);
    if (message.length > MAX_MESSAGE_LENGTH) return errors.push(`#${i} @${handle}: správa má viac ako ${MAX_MESSAGE_LENGTH} znakov`);
    if (seen.has(handle)) return errors.push(`#${i} @${handle}: duplicitný handle (ignorovaný)`);
    seen.add(handle);
    targets.push({ handle, message });
  });
  return { targets, errors };
}
