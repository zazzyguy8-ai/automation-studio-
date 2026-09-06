/** Argument parsing for the pipeline CLI, kept out of the script so it can be
 *  tested directly rather than by spawning a process. */

export interface FixtureSite {
  url: string;
  industry: string;
  country: string;
}

export const FIXTURES: Record<string, FixtureSite> = {
  'karoseria-hronec': { url: 'https://karoseria-hronec.sk', industry: 'auto body repair', country: 'SK' },
  'praxis-lindner': { url: 'https://lindner-dental.at', industry: 'dental clinic', country: 'AT' },
  'novak-reality': { url: 'https://novakreality.cz', industry: 'real estate agency', country: 'CZ' },
};

export interface PipelineArgs {
  website: string;
  industry: string | null;
  country: string | null;
  /** Set when --fixture was used; the caller swaps in the offline fetcher. */
  fixture: string | null;
  buildFee: number;
  monthlyFee: number;
  emailSteps: number;
}

export class PipelineArgsError extends Error {}

export const USAGE = [
  'usage: npm run pipeline -- <url> [options]',
  '   or: npm run pipeline -- --fixture <name>',
  '',
  'options:',
  '  --industry <text>     tunes the ROI assumption defaults',
  '  --country <code>      e.g. SK, AT, CZ',
  '  --fixture <name>      run offline against a bundled site',
  `                        (${Object.keys(FIXTURES).join(', ')})`,
  '  --build-fee <eur>     one-off build fee for the payback estimate (default 1500)',
  '  --monthly-fee <eur>   monthly management fee (default 300)',
  '  --emails <n>          how many email drafts to generate (default 2)',
].join('\n');

/** Flags that consume the following token as their value. */
const VALUE_FLAGS = new Set([
  '--industry', '--country', '--fixture', '--build-fee', '--monthly-fee', '--emails',
]);

function positiveNumber(raw: string | undefined, fallback: number, flag: string): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new PipelineArgsError(`${flag} must be a non-negative number, got "${raw}"`);
  }
  return n;
}

/**
 * Parses argv (the tokens after the script name).
 *
 * Deliberately strict: an unknown flag or a flag missing its value is an error
 * rather than something silently ignored, because a typo'd `--industry` used to
 * mean the audit quietly ran against the wrong assumptions.
 */
export function parsePipelineArgs(argv: string[]): PipelineArgs {
  const values = new Map<string, string>();
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (VALUE_FLAGS.has(token)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new PipelineArgsError(`${token} needs a value`);
      }
      values.set(token, value);
      i += 1;
      continue;
    }
    if (token.startsWith('--')) throw new PipelineArgsError(`unknown option "${token}"`);
    positionals.push(token);
  }

  const fixture = values.get('--fixture') ?? null;
  if (fixture && !FIXTURES[fixture]) {
    throw new PipelineArgsError(
      `unknown fixture "${fixture}". Options: ${Object.keys(FIXTURES).join(', ')}`,
    );
  }
  if (fixture && positionals.length > 0) {
    throw new PipelineArgsError('pass either a URL or --fixture, not both');
  }
  if (positionals.length > 1) {
    throw new PipelineArgsError(`expected one URL, got ${positionals.length}: ${positionals.join(', ')}`);
  }

  const preset = fixture ? FIXTURES[fixture] : null;
  const website = preset?.url ?? positionals[0];
  if (!website) throw new PipelineArgsError('a company URL is required');
  if (!preset && !/\.[a-z]{2,}/i.test(website)) {
    throw new PipelineArgsError(`"${website}" does not look like a URL`);
  }

  return {
    website,
    industry: values.get('--industry') ?? preset?.industry ?? null,
    country: values.get('--country') ?? preset?.country ?? null,
    fixture,
    buildFee: positiveNumber(values.get('--build-fee'), 1500, '--build-fee'),
    monthlyFee: positiveNumber(values.get('--monthly-fee'), 300, '--monthly-fee'),
    emailSteps: positiveNumber(values.get('--emails'), 2, '--emails'),
  };
}
