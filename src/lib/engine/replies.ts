import { getStore } from '@/lib/db';
import type { Lead, LeadStage, Reply, ReplyClass } from '@/lib/types';
import { cancelPendingForLead } from './sequence';

/**
 * Reply handling.
 *
 * Classification is rule-based rather than an LLM call: the rules are auditable,
 * they cost nothing, and the consequential cases (unsubscribe, bounce) must
 * never depend on a model being available or in a good mood. Everything else is
 * a hint for the inbox, and the operator makes the actual call.
 */

interface Rule {
  cls: ReplyClass;
  test: RegExp;
  reason: string;
  /** Checked before the softer classes; order in RULES is the priority. */
}

const RULES: Rule[] = [
  {
    cls: 'unsubscribe',
    test: /\b(unsubscribe|opt[- ]?out|remove me|take me off|stop (emailing|contacting)|do not (contact|email)|abmelden|keine (weiteren )?e?-?mails|austragen|afmeld|avmeld)\b/i,
    reason: 'explicit opt-out language',
  },
  {
    cls: 'bounce',
    test: /\b(delivery status notification|undeliverable|mailbox (is )?(full|unavailable)|address not found|550 5\.\d\.\d|recipient rejected|no such user)\b/i,
    reason: 'bounce notification',
  },
  {
    cls: 'auto_reply',
    test: /\b(out of (the )?office|automatic reply|auto[- ]?reply|on (annual )?leave|abwesenheit|autosvar|vacation reply|currently away)\b/i,
    reason: 'autoresponder',
  },
  {
    cls: 'booked',
    test: /\b(booked|invite sent|calendar invite|see you (on|at)|accepted the invitation|confirmed for)\b/i,
    reason: 'meeting appears to be booked',
  },
  {
    cls: 'not_now',
    test: /\b(not (right )?now|later in the year|next (quarter|year)|circle back|too busy|revisit|check back)\b/i,
    reason: 'timing objection rather than a refusal',
  },
  {
    cls: 'negative',
    test: /\b(not interested|no thanks|we('| a)re (all )?(set|sorted)|already have|not a (good )?fit|please stop|kein interesse)\b/i,
    reason: 'declines',
  },
  {
    cls: 'positive',
    test: /\b(interested|sounds good|tell me more|send (it|the video|it over)|yes please|happy to (chat|talk)|let'?s (talk|do)|book (a|the) call|what (would|does) (it|this) cost)\b/i,
    reason: 'expresses interest',
  },
  {
    cls: 'question',
    test: /\?/,
    reason: 'contains a question',
  },
];

export function classifyReply(subject: string | null, body: string): { cls: ReplyClass; reason: string } {
  const text = `${subject ?? ''}\n${body}`;
  for (const rule of RULES) {
    if (rule.test.test(text)) return { cls: rule.cls, reason: rule.reason };
  }
  return { cls: 'question', reason: 'no rule matched; treated as needing a human read' };
}

/** Where a reply moves the lead. Null means leave the stage alone. */
function stageFor(cls: ReplyClass): LeadStage | null {
  switch (cls) {
    case 'positive':
    case 'question':
    case 'not_now':
      return 'replied';
    case 'booked':
      return 'call';
    case 'negative':
    case 'unsubscribe':
      return 'lost';
    default:
      // Auto-replies and bounces say nothing about interest.
      return null;
  }
}

export interface IncomingReply {
  lead_id: string;
  message_id?: string | null;
  channel?: Reply['channel'];
  from_address: string;
  subject?: string | null;
  body: string;
  received_at?: string;
}

export interface ReplyOutcome {
  reply: Reply;
  lead: Lead;
  cancelled_messages: number;
  suppressed: boolean;
}

/**
 * Records a reply and acts on it.
 *
 * Every classification cancels the pending follow-ups except an autoresponder -
 * an out-of-office is not a reply, and stopping on one would silently kill
 * sequences that should continue. Unsubscribes and hard bounces additionally
 * go on the suppression list.
 */
export async function handleReply(incoming: IncomingReply): Promise<ReplyOutcome> {
  const store = await getStore();
  const lead = await store.getLead(incoming.lead_id);
  if (!lead) throw new Error(`lead ${incoming.lead_id} not found`);

  const { cls, reason } = classifyReply(incoming.subject ?? null, incoming.body);

  const reply = await store.insertReply({
    lead_id: lead.id,
    message_id: incoming.message_id ?? null,
    channel: incoming.channel ?? 'email',
    from_address: incoming.from_address,
    subject: incoming.subject ?? null,
    body: incoming.body,
    classification: cls,
    classification_reason: reason,
    received_at: incoming.received_at ?? new Date().toISOString(),
    // Anything a human should look at lands unhandled in the inbox.
    handled: cls === 'auto_reply',
  });

  let cancelled = 0;
  if (cls !== 'auto_reply') {
    cancelled = await cancelPendingForLead(lead.id, `reply classified as ${cls}`);
  }

  let suppressed = false;
  if (cls === 'unsubscribe' || cls === 'bounce') {
    await store.addSuppression({
      value: incoming.from_address,
      scope: 'address',
      reason: cls === 'unsubscribe' ? 'unsubscribe' : 'hard_bounce',
      note: `From reply on ${new Date().toISOString().slice(0, 10)}`,
    });
    suppressed = true;
  }

  const stage = stageFor(cls);
  const updated = stage ? await store.setLeadStage(lead.id, stage) : lead;

  return { reply, lead: updated, cancelled_messages: cancelled, suppressed };
}
