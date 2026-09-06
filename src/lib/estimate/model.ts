import type { AuditResult, Estimate, Snapshot } from '@/lib/types';
import { getTemplate } from '@/lib/blueprint/templates';

/**
 * Impact numbers exist so a prospect can picture the scale of a problem.
 * They are NOT measurements, and this module is built so they can never be
 * presented as measurements:
 *
 *  - every input is an explicit, named, editable planning assumption;
 *  - every output carries low/base/high, never a single confident figure;
 *  - every output carries `is_estimate: true` and the assumption list that
 *    produced it, and the UI refuses to render a number without them;
 *  - confidence is `assumed` unless the input came from the site itself.
 *
 * The defaults below are deliberately conservative placeholders for the
 * operator to replace with the client's real figures in the first call.
 * They are not research findings and must never be presented as such.
 */

export interface ImpactInputs {
  /** Enquiries per month across all channels. Ask the client; default is a placeholder. */
  monthly_enquiries: number;
  /** Share of enquiries that currently get no reply within an hour, 0-1. */
  slow_reply_rate: number;
  /** Share of slow-replied enquiries assumed lost to a faster competitor, 0-1. */
  loss_rate_when_slow: number;
  /** Average value of one won job, in EUR. */
  avg_job_value_eur: number;
  /** Enquiry -> customer conversion once contact is actually made, 0-1. */
  close_rate: number;
  /** Staff minutes currently spent handling one enquiry end to end. */
  minutes_per_enquiry: number;
  /** Minutes of that the agent removes. */
  minutes_saved_per_enquiry: number;
  /** Loaded cost of an hour of the staff time being replaced, in EUR. */
  staff_hourly_cost_eur: number;
}

export const DEFAULT_INPUTS: ImpactInputs = {
  monthly_enquiries: 60,
  slow_reply_rate: 0.4,
  loss_rate_when_slow: 0.3,
  avg_job_value_eur: 400,
  close_rate: 0.3,
  minutes_per_enquiry: 12,
  minutes_saved_per_enquiry: 8,
  staff_hourly_cost_eur: 22,
};

export const INPUT_LABELS: Record<keyof ImpactInputs, string> = {
  monthly_enquiries: 'Enquiries per month (all channels)',
  slow_reply_rate: 'Share not answered within an hour',
  loss_rate_when_slow: 'Share of those assumed lost to a faster competitor',
  avg_job_value_eur: 'Average value of one won job (EUR)',
  close_rate: 'Close rate once contact is made',
  minutes_per_enquiry: 'Staff minutes per enquiry today',
  minutes_saved_per_enquiry: 'Staff minutes the agent removes',
  staff_hourly_cost_eur: 'Loaded staff cost per hour (EUR)',
};

/** Vertical-specific starting points. Still assumptions - they only make the
 *  first conversation less wrong, they do not make the number a fact. */
const INDUSTRY_PRESETS: Array<[RegExp, Partial<ImpactInputs>]> = [
  [/auto|garage|servis|mechanic|tyre|karoser/i,
    { monthly_enquiries: 90, avg_job_value_eur: 350, close_rate: 0.35, minutes_per_enquiry: 10 }],
  [/real ?estate|realit|property|estate agent|makler/i,
    { monthly_enquiries: 70, avg_job_value_eur: 3500, close_rate: 0.08, minutes_per_enquiry: 20 }],
  [/clinic|dental|medical|health|klinik|zubn|physio|derma|aesthet/i,
    { monthly_enquiries: 120, avg_job_value_eur: 220, close_rate: 0.45, minutes_per_enquiry: 8 }],
  [/construct|builder|stavb|roofing|plumb|electric|renovation|remont/i,
    { monthly_enquiries: 45, avg_job_value_eur: 4500, close_rate: 0.15, minutes_per_enquiry: 25 }],
  [/law|legal|advokat|accountan|uctov|consult/i,
    { monthly_enquiries: 35, avg_job_value_eur: 1200, close_rate: 0.2, minutes_per_enquiry: 20 }],
];

export function presetInputs(industry: string | null, signals?: Snapshot['signals']): ImpactInputs {
  let inputs = { ...DEFAULT_INPUTS };
  if (industry) {
    for (const [re, patch] of INDUSTRY_PRESETS) {
      if (re.test(industry)) {
        inputs = { ...inputs, ...patch };
        break;
      }
    }
  }
  // A site that already answers instantly leaks less by definition.
  if (signals?.has_live_chat) inputs.slow_reply_rate = Math.min(inputs.slow_reply_rate, 0.2);
  if (signals?.has_online_booking) inputs.slow_reply_rate = Math.min(inputs.slow_reply_rate, 0.3);
  return inputs;
}

/** +/-40% band around the central case. The band is the honest part: it says
 *  out loud that we do not know this business's real numbers. */
function band(base: number, spread = 0.4): { low: number; base: number; high: number } {
  const round = (n: number) => Math.round(n * 10) / 10;
  return { low: round(base * (1 - spread)), base: round(base), high: round(base * (1 + spread)) };
}

const assumptionText = (i: ImpactInputs, keys: Array<keyof ImpactInputs>): string[] => [
  'Estimate, not a measurement - we have no access to this business\'s call log, CRM or revenue.',
  ...keys.map((k) => `Assumes ${INPUT_LABELS[k].toLowerCase()} = ${i[k]}`),
  'Replace these with the client\'s real figures on the first call; the numbers recompute.',
];

export function computeImpact(audit: AuditResult, inputs: ImpactInputs): Estimate[] {
  const winner = audit.opportunities.find((o) => o.id === audit.recommended_opportunity_id);
  const driver = winner ? getTemplate(winner.template_key)?.impact_driver ?? 'lead_response' : 'lead_response';

  const out: Estimate[] = [];

  // Hours of staff time removed.
  const hoursSaved = (inputs.monthly_enquiries * inputs.minutes_saved_per_enquiry) / 60;
  out.push({
    label: 'Staff hours removed per month',
    unit: 'hours/month',
    ...band(hoursSaved),
    confidence: 'assumed',
    assumptions: assumptionText(inputs, ['monthly_enquiries', 'minutes_saved_per_enquiry']),
    is_estimate: true,
  });

  // Enquiries recovered, only meaningful for response/recovery/booking drivers.
  if (driver === 'lead_response' || driver === 'recovery' || driver === 'booking') {
    const recovered = inputs.monthly_enquiries * inputs.slow_reply_rate * inputs.loss_rate_when_slow;
    out.push({
      label: 'Enquiries recovered per month',
      unit: 'enquiries/month',
      ...band(recovered),
      confidence: 'assumed',
      assumptions: assumptionText(inputs, ['monthly_enquiries', 'slow_reply_rate', 'loss_rate_when_slow']),
      is_estimate: true,
    });

    const revenue = recovered * inputs.close_rate * inputs.avg_job_value_eur;
    out.push({
      label: 'Revenue influenced per month',
      unit: 'EUR/month',
      ...band(revenue, 0.5),
      confidence: 'assumed',
      assumptions: [
        ...assumptionText(inputs, ['close_rate', 'avg_job_value_eur']),
        'Influenced, not attributed: these are enquiries that would otherwise have gone unanswered.',
      ],
      is_estimate: true,
    });
  }

  // Cost of the staff time removed.
  const costSaved = hoursSaved * inputs.staff_hourly_cost_eur;
  out.push({
    label: 'Staff cost removed per month',
    unit: 'EUR/month',
    ...band(costSaved),
    confidence: 'assumed',
    assumptions: assumptionText(inputs, ['staff_hourly_cost_eur', 'minutes_saved_per_enquiry']),
    is_estimate: true,
  });

  return out;
}

/** Payback on a build fee, expressed as a range because its inputs are ranges. */
export function paybackMonths(
  impact: Estimate[],
  buildFeeEur: number,
  monthlyFeeEur: number,
): Estimate {
  const revenue = impact.find((i) => i.unit === 'EUR/month' && i.label.startsWith('Revenue'));
  const cost = impact.find((i) => i.label.startsWith('Staff cost'));
  const monthlyValue = {
    low: (revenue?.low ?? 0) + (cost?.low ?? 0),
    base: (revenue?.base ?? 0) + (cost?.base ?? 0),
    high: (revenue?.high ?? 0) + (cost?.high ?? 0),
  };
  const months = (value: number) => (value <= monthlyFeeEur ? Infinity : buildFeeEur / (value - monthlyFeeEur));
  const clamp = (n: number) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : 999);

  return {
    label: 'Months to pay back the build fee',
    unit: 'months',
    low: clamp(months(monthlyValue.high)),
    base: clamp(months(monthlyValue.base)),
    high: clamp(months(monthlyValue.low)),
    confidence: 'assumed',
    assumptions: [
      'Estimate, not a measurement.',
      `Assumes a build fee of EUR ${buildFeeEur} and EUR ${monthlyFeeEur}/month management.`,
      'A value of 999 means the monthly fee exceeds the estimated monthly value under that scenario.',
    ],
    is_estimate: true,
  };
}
