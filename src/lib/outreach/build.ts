import { getStore } from '@/lib/db';
import { getProvider } from '@/lib/llm';
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

/** Approval is the only path to 'approved', and it enforces the blockers. */
export async function approveOutreachForLead(leadId: string, messageId: string): Promise<OutreachMessage> {
  const store = await getStore();
  const lead = await store.getLead(leadId);
  if (!lead) throw new Error(`lead ${leadId} not found`);
  const message = (await store.listOutreach(leadId)).find((m) => m.id === messageId);
  if (!message) throw new Error(`message ${messageId} not found for lead ${leadId}`);

  const blockers = outreachBlockers(message, lead);
  if (blockers.length > 0) {
    throw new Error(`cannot approve: ${blockers.join(' | ')}`);
  }
  return store.setOutreachStatus(messageId, 'approved');
}
