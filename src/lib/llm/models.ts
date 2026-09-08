/**
 * Which Claude model each job runs on, and the one place that decides it.
 *
 * This exists because of a real failure: `AUDIT_MODEL` was read as
 * `process.env.AUDIT_MODEL ?? 'claude-opus-5'` in three separate files. `??`
 * only falls back on undefined, so an env file containing `AUDIT_MODEL=` (an
 * empty value, which is what a half-filled .env.local looks like) or a
 * truncated paste like `AUDIT_MODEL=claude-opus-` sent that string straight to
 * the API. The result was a 404 in the middle of a live audit, reporting a
 * model name that did not obviously look wrong - `model: claude-opus- `.
 *
 * A misconfigured model is a startup problem, not a request-time problem. It
 * should be caught before an API call is made, and the error should say what
 * to change.
 */

/**
 * Model IDs this project runs against.
 *
 * Deliberately a closed set rather than a shape check. The whole point is that
 * a value which merely *looks* plausible must not reach the API - that is the
 * bug being fixed. Adding a model is a one-line change here.
 *
 * Note the IDs carry no date suffix: `claude-opus-5`, never
 * `claude-opus-5-20260401`.
 */
export const SUPPORTED_MODELS = [
  'claude-opus-5',
  'claude-sonnet-5',
  'claude-haiku-4-5',
] as const;

export type SupportedModel = (typeof SUPPORTED_MODELS)[number];

/** Reasoning over a whole site: the audit is the product, so it gets Opus. */
export const DEFAULT_AUDIT_MODEL: SupportedModel = 'claude-opus-5';
/** Short, high-volume copy where Opus would be paying for nothing. */
export const DEFAULT_COPY_MODEL: SupportedModel = 'claude-sonnet-5';

export interface ModelResolution {
  /** Always safe to use: the default when the override was unusable. */
  model: string;
  /** Operator-facing description of what is wrong, or null when it is fine. */
  problem: string | null;
}

function isSupported(value: string): value is SupportedModel {
  return (SUPPORTED_MODELS as readonly string[]).includes(value);
}

/** Why a given override is being rejected, in terms the operator can act on. */
function diagnose(envName: string, raw: string): string {
  const supported = SUPPORTED_MODELS.join(', ');

  if (/-$/.test(raw)) {
    return `${envName}="${raw}" ends in a hyphen and looks truncated - a version is missing. `
      + `Supported: ${supported}.`;
  }
  if (/-\d{8}$/.test(raw)) {
    const stripped = raw.replace(/-\d{8}$/, '');
    return `${envName}="${raw}" has a date suffix. Model IDs do not carry one`
      + `${isSupported(stripped) ? ` - use "${stripped}"` : ''}. Supported: ${supported}.`;
  }
  if (/\s/.test(raw)) {
    return `${envName}="${raw}" contains whitespace inside the model name. Supported: ${supported}.`;
  }
  return `${envName}="${raw}" is not a model this project supports. Supported: ${supported}.`;
}

/**
 * Reads a model override without ever returning something unusable.
 *
 * Unset and empty both mean "use the default" - an operator who wrote
 * `AUDIT_MODEL=` in a .env file meant the same thing as leaving the line out.
 * Surrounding whitespace is trimmed, because a trailing space in an env file
 * is invisible and is exactly how `claude-opus-5 ` gets there.
 */
export function resolveModel(envName: string, fallback: SupportedModel): ModelResolution {
  const raw = (process.env[envName] ?? '').trim();
  if (raw === '') return { model: fallback, problem: null };
  if (isSupported(raw)) return { model: raw, problem: null };
  return { model: fallback, problem: diagnose(envName, raw) };
}

/**
 * The same read, but refusing to continue on a bad override.
 *
 * Used where an API call is about to be made: silently falling back to the
 * default would hide that the operator's configuration is being ignored, and
 * they would keep believing they were running the model they set.
 */
export function requireModel(envName: string, fallback: SupportedModel): string {
  const { model, problem } = resolveModel(envName, fallback);
  if (problem) throw new Error(problem);
  return model;
}

export const auditModel = () => requireModel('AUDIT_MODEL', DEFAULT_AUDIT_MODEL);
export const copyModel = () => requireModel('COPY_MODEL', DEFAULT_COPY_MODEL);
