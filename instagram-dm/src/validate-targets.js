import { loadTargets } from './targets.js';
import { readAlreadySent } from './logger.js';

try {
  const { targets, errors } = loadTargets();
  const already = readAlreadySent();
  errors.forEach((e) => console.log(`⚠️  ${e}`));
  const pending = targets.filter((t) => !already.has(t.handle));
  console.log(`targets.json OK: ${targets.length} platných, ${pending.length} ešte neodoslaných, ${errors.length} problémov.`);
} catch (e) {
  console.error(`❌ ${e.message}`);
  process.exit(1);
}
