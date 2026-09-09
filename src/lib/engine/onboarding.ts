import { z } from 'zod';
import type { Campaign } from '@/lib/types';

/**
 * The questionnaire that turns "what I sell and who I want" into a running
 * campaign.
 *
 * This is the only part of the product the user actually fills in. Everything
 * downstream - discovery, the audit, the drafting, the approval inbox - is
 * already parameterised, so this file's whole job is to answer a handful of
 * plain questions and derive a Campaign from them.
 *
 * The derivations here are deliberately explicit rather than clever. Somebody
 * selling a EUR 8,000 build should not be pushed 200 leads a day, and somebody
 * selling a EUR 300 service cannot survive on eight. Those are the kind of
 * decisions a user should be able to read off the screen and disagree with,
 * not something buried in a scoring function.
 */

/** How much of the outreach the engine is allowed to do. */
export const OutreachModeSchema = z.enum([
  /** Find, verify and research. Write nothing - the user writes it themselves. */
  'research_only',
  /** Find and verify contact details only. No audit, no writing. */
  'contacts_only',
  /** The full pipeline: research, draft, approve, send email. */
  'email',
]);
export type OutreachMode = z.infer<typeof OutreachModeSchema>;

export const OUTREACH_MODES: Array<{
  value: OutreachMode; label: string; detail: string;
}> = [
  {
    value: 'contacts_only',
    label: 'Just find them',
    detail: 'Verified companies and public contact details. No analysis, no writing. Cheapest to run.',
  },
  {
    value: 'research_only',
    label: 'Find and research',
    detail: 'Adds the site analysis and the specific problem worth selling against. You write the message.',
  },
  {
    value: 'email',
    label: 'Find, research and write the email',
    detail: 'The full pipeline. Every message still waits in your inbox for approval before it sends.',
  },
];

/** Deal size, which is what actually decides the shape of a campaign. */
export const TicketSchema = z.enum(['low', 'mid', 'high']);
export type Ticket = z.infer<typeof TicketSchema>;

export const TICKETS: Array<{ value: Ticket; label: string; detail: string }> = [
  { value: 'low', label: 'Under EUR 1,000', detail: 'Volume matters more than depth.' },
  { value: 'mid', label: 'EUR 1,000 - 5,000', detail: 'A balance of reach and research.' },
  { value: 'high', label: 'Over EUR 5,000', detail: 'Few leads, deeply researched.' },
];

export const OnboardingAnswersSchema = z.object({
  /** "I build Shopify stores", "I do bookkeeping for tradespeople". */
  what_you_do: z.string().min(10, 'Say what you do in a sentence - it goes into every email.'),
  /** The concrete thing being sold. */
  what_you_offer: z.string().min(10, 'What are they buying? Be specific.'),
  /** Free text: the engine searches this against a multilingual taxonomy. */
  target_industry: z.string().min(2, 'Which kind of business do you want to reach?'),
  /** ISO code. */
  country: z.string().length(2, 'Two-letter country code, e.g. GB, DE, SK.'),
  /** Cities are the unit of search: a country-wide query returns unusable results. */
  cities: z.array(z.string().min(1)).min(1, 'Add at least one city.').max(20),
  ticket: TicketSchema,
  build_fee_eur: z.number().min(0),
  monthly_fee_eur: z.number().min(0),
  /** What the user asked for; the derivation below may hold it back. */
  leads_per_day: z.number().int().min(1).max(200),
  mode: OutreachModeSchema,
});
export type OnboardingAnswers = z.infer<typeof OnboardingAnswersSchema>;

/**
 * How many leads a day this deal size can actually support.
 *
 * Not a limit for its own sake. A high-ticket offer wins on the quality of the
 * research in each message, and the research is the expensive part - both in
 * money and in how long the run takes. Asking for 200 a day at that size buys
 * two hundred shallow emails, which is the failure mode this product exists to
 * avoid.
 */
export const MAX_PER_DAY: Record<Ticket, number> = { low: 60, mid: 30, high: 12 };

/** How many of the discovered companies are worth drafting for. */
const DRAFT_RATIO: Record<Ticket, number> = { low: 0.5, mid: 0.4, high: 0.35 };

export interface DerivedCampaign {
  /** Ready to hand to createCampaign(), minus the id and timestamp. */
  campaign: Omit<Campaign, 'id' | 'created_at'>;
  /** Cities beyond the first, which each become their own run. */
  extra_cities: string[];
  /**
   * Anything the answers asked for that was adjusted, and why. Shown to the
   * user rather than applied silently - a cap they cannot see is a cap they
   * will assume is a bug.
   */
  adjustments: string[];
}

export function campaignFromAnswers(answers: OnboardingAnswers): DerivedCampaign {
  const adjustments: string[] = [];

  const ceiling = MAX_PER_DAY[answers.ticket];
  let perDay = answers.leads_per_day;
  if (perDay > ceiling) {
    adjustments.push(
      `Leads per day reduced from ${perDay} to ${ceiling}. At this deal size the research `
      + 'in each message is what closes it, and that is the part volume destroys.',
    );
    perDay = ceiling;
  }

  const draftCap = Math.max(1, Math.round(perDay * DRAFT_RATIO[answers.ticket]));

  if (answers.mode === 'contacts_only') {
    adjustments.push('Contacts only: nothing will be analysed or written. You get the list.');
  }
  if (answers.mode === 'research_only') {
    adjustments.push('Research only: you will get the problem worth selling against, and write the message yourself.');
  }

  const [firstCity, ...extra] = answers.cities;
  if (extra.length > 0) {
    adjustments.push(`${extra.length} further ${extra.length === 1 ? 'city runs' : 'cities run'} after ${firstCity}.`);
  }

  return {
    campaign: {
      name: `${answers.target_industry} · ${answers.country}`,
      industry: answers.target_industry,
      country: answers.country.toUpperCase(),
      city: firstCity,
      daily_target: perDay,
      daily_send_cap: draftCap,
      build_fee_eur: answers.build_fee_eur,
      monthly_fee_eur: answers.monthly_fee_eur,
      outreach_mode: answers.mode,
      status: 'active',
    },
    extra_cities: extra,
    adjustments,
  };
}

/**
 * What the user is told the campaign will do, in their own numbers.
 *
 * Stated as a range and labelled, because none of it is a measurement - it is
 * arithmetic over what they just typed. The product's whole credibility rests
 * on never blurring that line.
 */
export function projectMonthly(derived: DerivedCampaign): {
  discovered: [number, number];
  drafted: [number, number];
  is_estimate: true;
  assumptions: string[];
} {
  const { daily_target, daily_send_cap } = derived.campaign;
  const workingDays = 22;
  // Discovery rarely returns a full page of usable companies with websites.
  const usable: [number, number] = [0.55, 0.85];
  return {
    discovered: [
      Math.round(daily_target * usable[0] * workingDays),
      Math.round(daily_target * usable[1] * workingDays),
    ],
    drafted: [
      Math.round(daily_send_cap * usable[0] * workingDays),
      Math.round(daily_send_cap * usable[1] * workingDays),
    ],
    is_estimate: true,
    assumptions: [
      `${workingDays} working days a month`,
      `${Math.round(usable[0] * 100)}-${Math.round(usable[1] * 100)}% of companies found have a website we can read`,
      'Nothing sends without your approval, so the number actually sent is yours to decide',
    ],
  };
}
