import { getStore } from '@/lib/db';
import type { EngineState, Lead, LeadStage, OutreachMessage, Reply, Suppression } from '@/lib/types';

/**
 * Engine dashboard.
 *
 * Every figure here is a count of something that actually happened - messages
 * sent, replies received, leads at a stage. Unlike the client ROI dashboard,
 * nothing on this screen is an estimate, so nothing needs an assumption list.
 */

export interface EngineDashboard {
  engine: EngineState;
  /** Sending is on only when the switch is off AND capacity remains. */
  can_send_now: boolean;
  send_blocked_reason: string | null;
  leads: {
    total: number;
    by_stage: Record<LeadStage, number>;
  };
  messages: {
    awaiting_approval: number;
    approved_not_sent: number;
    scheduled_follow_ups: number;
    follow_ups_pending_first_touch: number;
    sent: number;
    cancelled: number;
    suppressed: number;
    failed: number;
    rejected: number;
  };
  replies: {
    total: number;
    unhandled: number;
    positive: number;
    booked: number;
    negative: number;
    unsubscribe: number;
    bounce: number;
    /** Sent -> replied, as a percentage. Both numbers are measured. */
    reply_rate_pct: number | null;
    positive_rate_pct: number | null;
  };
  suppression_count: number;
  recent_replies: Reply[];
  inbox: Array<{ message: OutreachMessage; lead: Lead }>;
}

const STAGES: LeadStage[] = ['new', 'audited', 'contacted', 'replied', 'call', 'proposal', 'won', 'lost'];

export async function engineDashboard(inboxLimit = 25): Promise<EngineDashboard> {
  const store = await getStore();
  const [engine, leads, replies, suppressions, counts] = await Promise.all([
    store.getEngineState(), store.listLeads(), store.listReplies(500),
    store.listSuppressions(), store.countOutreach(),
  ]);

  const drafts = await store.listOutreachByStatus('draft', inboxLimit * 4);
  const approved = await store.listOutreachByStatus('approved', 200);
  const queued = await store.listOutreachByStatus('queued', 200);

  // The inbox holds what you can actually decide on now: first touches, and
  // follow-ups whose scheduled time is within a day.
  //
  // An unscheduled follow-up is NOT actionable: it is waiting on its own first
  // touch to be approved and sent. Counting those made a run of 100 report 300
  // awaiting approval, when the operator only has 100 decisions to make.
  const soon = new Date(Date.now() + 86_400_000).toISOString();
  const actionable = (m: OutreachMessage) =>
    m.step === 0 || (Boolean(m.scheduled_at) && m.scheduled_at! <= soon);

  const inbox: EngineDashboard['inbox'] = [];
  for (const message of drafts) {
    if (!actionable(message)) continue;
    const lead = await store.getLead(message.lead_id);
    if (lead) inbox.push({ message, lead });
    if (inbox.length >= inboxLimit) break;
  }

  const by_stage = Object.fromEntries(
    STAGES.map((s) => [s, leads.filter((l) => l.stage === s).length]),
  ) as Record<LeadStage, number>;

  const sent = counts.sent ?? 0;
  const countCls = (c: Reply['classification']) => replies.filter((r) => r.classification === c).length;
  // Autoresponders and bounces are not replies from a person, so they do not
  // count towards a reply rate that is meant to say "did this land".
  const humanReplies = replies.filter(
    (r) => r.classification !== 'auto_reply' && r.classification !== 'bounce',
  ).length;
  const positive = countCls('positive') + countCls('booked');

  const pct = (n: number) => (sent > 0 ? Number(((n / sent) * 100).toFixed(1)) : null);

  const capacityLeft = engine.daily_send_cap - engine.sent_today;
  const send_blocked_reason = engine.kill_switch
    ? `Kill switch is on${engine.kill_switch_reason ? `: ${engine.kill_switch_reason}` : ''}.`
    : capacityLeft <= 0
      ? `Daily cap reached (${engine.sent_today}/${engine.daily_send_cap}).`
      : null;

  return {
    engine,
    can_send_now: send_blocked_reason === null,
    send_blocked_reason,
    leads: { total: leads.length, by_stage },
    messages: {
      awaiting_approval: drafts.filter(actionable).length,
      approved_not_sent: approved.length,
      scheduled_follow_ups: [...drafts, ...approved, ...queued].filter((m) => m.step > 0 && m.scheduled_at).length,
      // Drafted, but blocked until their first touch goes out.
      follow_ups_pending_first_touch: drafts.filter((m) => m.step > 0 && !m.scheduled_at).length,
      sent,
      cancelled: counts.cancelled ?? 0,
      suppressed: counts.suppressed ?? 0,
      failed: counts.failed ?? 0,
      rejected: counts.rejected ?? 0,
    },
    replies: {
      total: replies.length,
      unhandled: replies.filter((r) => !r.handled).length,
      positive: countCls('positive'),
      booked: countCls('booked'),
      negative: countCls('negative'),
      unsubscribe: countCls('unsubscribe'),
      bounce: countCls('bounce'),
      reply_rate_pct: pct(humanReplies),
      positive_rate_pct: pct(positive),
    },
    suppression_count: suppressions.length,
    recent_replies: replies.slice(0, 20),
    inbox,
  };
}

export type { Suppression };
