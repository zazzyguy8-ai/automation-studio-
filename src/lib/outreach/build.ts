import { getStore } from '@/lib/db';
import { getProvider } from '@/lib/llm';
import { getMarket, type Market } from '@/lib/discovery/markets';
import type { Audit, Channel, Demo, Lead, OutreachMessage } from '@/lib/types';

export interface Sender {
  name: string;
  company: string;
  calendar_url: string;
}

export function senderFromEnv(): Sender {
  return {
    name: process.env.SENDER_NAME ?? 'Richard',
    company: process.env.SENDER_COMPANY ?? 'Automation Studio',
    calendar_url: process.env.SENDER_CALENDAR_URL ?? 'https://cal.com/your-handle/15min',
  };
}

/** Non-blocking things the operator must see before approving. */
export interface OutreachReview {
  blockers: string[];
  warnings: string[];
  market: Market;
  /** True when the market's regime means approval needs a deliberate decision. */
  requires_explicit_ack: boolean;
}

/**
 * Everything the operator needs in order to decide, in one place.
 *
 * Blockers stop approval outright. Warnings do not - they are judgement calls
 * that belong to the operator, not to the software. The market note is the one
 * that matters most: a cold email that is routine in the UK is a legal problem
 * in Germany, and the same draft would otherwise sail through both.
 */
export function reviewOutreach(message: OutreachMessage, lead: Lead): OutreachReview {
  const market = getMarket(lead.country);
  const warnings: string[] = [];

  if (market.outreach_risk !== 'low') {
    warnings.push(`${market.name}: ${market.outreach_note}`);
  }
  for (const required of market.required_in_message) {
    warnings.push(`Before sending, check the message contains: ${required}.`);
  }

  // An email draft is useless without an address that actually exists.
  if (message.channel === 'email') {
    const emails = lead.contacts.filter((c) => c.kind === 'email');
    if (emails.length === 0) {
      warnings.push('No verified email address on this lead - there is nowhere to send the draft.');
    } else if (!emails.some((c) => c.label === 'found_on_site')) {
      warnings.push('The email address comes from a directory and is not confirmed on the company site.');
    }
  }

  return {
    blockers: outreachBlockers(message, lead),
    warnings,
    market,
    requires_explicit_ack: market.outreach_risk === 'high',
  };
}

/** Reasons a draft may not be approved. Approval is blocked, not warned about. */
export function outreachBlockers(message: OutreachMessage, lead: Lead): string[] {
  const blockers: string[] = [];
  if (message.grounding.length === 0) {
    blockers.push('No grounding: this message is not tied to anything found in the audit.');
  }
  if (!message.body.toLowerCase().includes(lead.company_name.toLowerCase().split(' ')[0].toLowerCase())
      && !message.body.includes(new URL(lead.website).hostname.replace(/^www\./, ''))) {
    blockers.push('Message never names the company or its site - it would read as a mass send.');
  }
  if (message.channel === 'email' && message.body.split(/\s+/).length > 220) {
    blockers.push('Email is over 220 words.');
  }
  if (message.channel !== 'email' && message.body.split(/\s+/).length > 90) {
    blockers.push('DM is over 90 words.');
  }
  if (/\b(hope this (email )?finds you well|quick question|i love what you|game[- ]?changer|revolutioniz)/i.test(message.body)) {
    blockers.push('Contains a template opener that marks it as bulk outreach.');
  }
  return blockers;
}

/**
 * Generates the sequence for one channel. Nothing is sent from here: every
 * message is written as a draft, and sending is a separate, explicit step
 * after a human approves it.
 */
export async function buildOutreachSequence(
  lead: Lead,
  audit: Audit,
  demo: Demo,
  channel: Channel,
  steps = 3,
  sender: Sender = senderFromEnv(),
): Promise<OutreachMessage[]> {
  if (audit.status !== 'ok' || !audit.result) {
    throw new Error('outreach must be grounded in a passed audit');
  }
  const store = await getStore();
  const provider = getProvider();
  const out: OutreachMessage[] = [];

  for (let step = 0; step < steps; step += 1) {
    const copy = await provider.writeOutreach({
      lead, audit: audit.result, demo, channel, step, sender,
    });
    out.push(await store.insertOutreach({
      lead_id: lead.id,
      audit_id: audit.id,
      channel,
      step,
      subject: copy.subject,
      body: copy.body,
      status: 'draft',
      grounding: copy.grounding,
      approved_at: null,
      sent_at: null,
      created_at: new Date().toISOString(),
    }));
  }
  return out;
}

/**
 * Approval is the only path to 'approved', and it is always a human act.
 *
 * On a high-risk market the caller must pass `acknowledgeMarketRisk: true`,
 * which the UI only sets when the operator has ticked the box next to the
 * market note. It is deliberately impossible to approve a German cold email
 * without having been shown why that is riskier than a British one.
 */
export async function approveOutreachForLead(
  leadId: string,
  messageId: string,
  options: { acknowledgeMarketRisk?: boolean } = {},
): Promise<OutreachMessage> {
  const store = await getStore();
  const lead = await store.getLead(leadId);
  if (!lead) throw new Error(`lead ${leadId} not found`);
  const message = (await store.listOutreach(leadId)).find((m) => m.id === messageId);
  if (!message) throw new Error(`message ${messageId} not found for lead ${leadId}`);

  const review = reviewOutreach(message, lead);
  if (review.blockers.length > 0) {
    throw new Error(`cannot approve: ${review.blockers.join(' | ')}`);
  }
  if (review.requires_explicit_ack && !options.acknowledgeMarketRisk) {
    throw new Error(
      `cannot approve: ${review.market.name} is a high-risk market for cold outreach. `
      + `${review.market.outreach_note} Acknowledge this deliberately if you want to proceed.`,
    );
  }
  return store.setOutreachStatus(messageId, 'approved');
}
