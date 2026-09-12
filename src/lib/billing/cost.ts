/**
 * What it costs us to serve one account, so a price can be checked rather than
 * guessed.
 *
 * EVERY NUMBER BELOW IS AN ESTIMATE. The token counts come from measuring the
 * actual request this engine sends (the audit request body for a real fixture
 * was 10,348 characters) plus the output the schema demands; the prices are
 * Anthropic's published per-token rates. Nothing here has been reconciled
 * against a real invoice yet, because nothing has run against a real key.
 *
 * That is exactly why it lives in code with the assumptions named: when real
 * usage arrives, these constants are what gets corrected, and the margin test
 * re-runs against the truth rather than against a number somebody remembered.
 */

/** USD per million tokens, as published. */
const RATES = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-haiku-4-5': { input: 1, output: 5 },
} as const;

export type CostModel = keyof typeof RATES;

/** Conservative: understating the euro makes every margin look worse, not better. */
export const USD_PER_EUR = 1.05;

function usd(model: CostModel, inTok: number, outTok: number): number {
  const r = RATES[model];
  return (inTok / 1_000_000) * r.input + (outTok / 1_000_000) * r.output;
}

/**
 * Token estimates per call, with the reasoning for each.
 *
 * `output` includes thinking, because thinking is billed as output and comes
 * out of the same budget - that is the single biggest cost driver here and the
 * easiest one to forget.
 */
export const CALLS = {
  /** Cheap triage: is this company worth reading properly at all? */
  prefilter: { model: 'claude-haiku-4-5' as CostModel, input: 2_000, output: 300 },
  /** The audit at effort 'high' - thinking dominates. */
  audit_high: { model: 'claude-opus-5' as CostModel, input: 3_000, output: 18_000 },
  /** The audit at effort 'medium' - materially less thinking, same schema. */
  audit_medium: { model: 'claude-opus-5' as CostModel, input: 3_000, output: 12_000 },
  /** The same audit on Sonnet: a good analysis rather than the best one. */
  audit_sonnet: { model: 'claude-sonnet-5' as CostModel, input: 3_000, output: 12_000 },
  /** One outreach message. */
  copy: { model: 'claude-sonnet-5' as CostModel, input: 2_000, output: 600 },
  /** A 60-120 second demo script. */
  demo: { model: 'claude-sonnet-5' as CostModel, input: 2_000, output: 1_200 },
} as const;

export type CallKey = keyof typeof CALLS;

export function callCostUsd(key: CallKey): number {
  const c = CALLS[key];
  return usd(c.model, c.input, c.output);
}

/**
 * How many companies get discovered and triaged for each one that earns a full
 * audit. Discovery returns plenty that are unreadable, already automated, or
 * out of scope.
 */
export const TRIAGE_RATIO = 3;

/** Hosting, database, email sending and monitoring, per account per month. */
export const FIXED_USD_PER_ACCOUNT = 3;

/**
 * The all-in cost of one audited lead: the triage that found it, the audit
 * itself, the message, and the demo script.
 */
export function costPerAuditUsd(auditCall: CallKey): number {
  return TRIAGE_RATIO * callCostUsd('prefilter')
    + callCostUsd(auditCall)
    + callCostUsd('copy')
    + callCostUsd('demo');
}

export interface Margin {
  revenue_usd: number;
  variable_usd: number;
  fixed_usd: number;
  total_cost_usd: number;
  profit_usd: number;
  /** 0-1. This is the number the plans are set against. */
  margin: number;
}

/** The margin on one account running its plan to the ceiling - the worst case. */
export function marginAtCeiling(
  priceEurMonth: number,
  auditsPerMonth: number,
  auditCall: CallKey,
): Margin {
  const revenue = (priceEurMonth / 100) * USD_PER_EUR;
  const variable = auditsPerMonth * costPerAuditUsd(auditCall);
  const total = variable + FIXED_USD_PER_ACCOUNT;
  return {
    revenue_usd: Number(revenue.toFixed(2)),
    variable_usd: Number(variable.toFixed(2)),
    fixed_usd: FIXED_USD_PER_ACCOUNT,
    total_cost_usd: Number(total.toFixed(2)),
    profit_usd: Number((revenue - total).toFixed(2)),
    margin: revenue > 0 ? Number(((revenue - total) / revenue).toFixed(4)) : 0,
  };
}

/**
 * The floor every paid plan has to clear.
 *
 * Measured at the ceiling, not at average use. A plan that only works because
 * most customers do not use what they bought is a plan that breaks the moment
 * they do.
 */
export const MIN_MARGIN = 0.70;

/** The largest audit ceiling a price can carry and still clear MIN_MARGIN. */
export function maxAuditsForMargin(priceEurMonth: number, auditCall: CallKey): number {
  const revenue = (priceEurMonth / 100) * USD_PER_EUR;
  const budget = revenue * (1 - MIN_MARGIN) - FIXED_USD_PER_ACCOUNT;
  if (budget <= 0) return 0;
  return Math.floor(budget / costPerAuditUsd(auditCall));
}

/**
 * The request parameters a plan's audit call maps to.
 *
 * This is what connects a price to a model. Without it the plan would be a
 * claim on a settings screen and the engine would keep running whatever the
 * environment said - which is exactly how the first version of the pricing
 * came to lose money on every tier.
 */
export function auditRequestFor(key: CallKey): { model: CostModel; effort: 'medium' | 'high' } {
  switch (key) {
    case 'audit_sonnet': return { model: 'claude-sonnet-5', effort: 'medium' };
    case 'audit_medium': return { model: 'claude-opus-5', effort: 'medium' };
    case 'audit_high': return { model: 'claude-opus-5', effort: 'high' };
    // Non-audit calls have no business selecting the audit model.
    default: throw new Error(`${key} is not an audit call`);
  }
}
