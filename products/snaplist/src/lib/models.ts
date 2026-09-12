/**
 * Which Claude model does the looking, and the one place that decides it.
 *
 * Same closed-set rule as the studio app: a model name that merely looks
 * plausible must never reach the API. A 404 in the middle of a paying user's
 * upload is a configuration bug that should have been caught at boot.
 */

export const SUPPORTED_MODELS = ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'] as const;

export type SupportedModel = (typeof SUPPORTED_MODELS)[number];

/**
 * Reading a photo and writing 200 words of copy is not a reasoning problem,
 * it is a perception problem with a tight output. Sonnet sees as well as Opus
 * here and costs a fraction, which is what makes $9/month work at volume.
 */
export const DEFAULT_VISION_MODEL: SupportedModel = 'claude-sonnet-5';

function isSupported(value: string): value is SupportedModel {
  return (SUPPORTED_MODELS as readonly string[]).includes(value);
}

function diagnose(envName: string, raw: string): string {
  const supported = SUPPORTED_MODELS.join(', ');
  if (/-$/.test(raw)) return `${envName}="${raw}" ends in a hyphen and looks truncated. Supported: ${supported}.`;
  if (/-\d{8}$/.test(raw)) {
    const stripped = raw.replace(/-\d{8}$/, '');
    return `${envName}="${raw}" has a date suffix. Model IDs do not carry one`
      + `${isSupported(stripped) ? ` - use "${stripped}"` : ''}. Supported: ${supported}.`;
  }
  if (/\s/.test(raw)) return `${envName}="${raw}" contains whitespace. Supported: ${supported}.`;
  return `${envName}="${raw}" is not a model this project supports. Supported: ${supported}.`;
}

/** Resolves an override, refusing to continue on one that would 404. */
export function requireModel(envName = 'VISION_MODEL', fallback: SupportedModel = DEFAULT_VISION_MODEL): string {
  const raw = (process.env[envName] ?? '').trim();
  if (raw === '') return fallback;
  if (isSupported(raw)) return raw;
  throw new Error(diagnose(envName, raw));
}

/** Haiku 4.5 still takes the older thinking shape; the 5-series takes effort. */
export function supportsEffort(model: string): boolean {
  return model === 'claude-opus-5' || model === 'claude-sonnet-5';
}
