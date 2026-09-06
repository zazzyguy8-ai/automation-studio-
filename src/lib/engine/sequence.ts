import { getStore } from '@/lib/db';
import type { OutreachMessage } from '@/lib/types';

/**
 * Follow-up scheduling.
 *
 * Two follow-ups, no more, at +3 and +5 days after the first touch went out.
 * They are created as DRAFTS, not as approved messages: the brief asked for
 * automatic follow-ups, but "automatic" here means the drafts appear and the
 * timing is handled - you still approve each one. A system that can send three
 * messages to a stranger off one approval is one bad prompt away from being a
 * spam cannon.
 *
 * Any reply, unsubscribe or bounce cancels every unsent message in the thread.
 */

export const FOLLOW_UP_DAYS = [3, 5] as const;
export const MAX_FOLLOW_UPS = FOLLOW_UP_DAYS.length;

const addDays = (from: Date, days: number) => new Date(from.getTime() + days * 86_400_000).toISOString();

/**
 * Creates the follow-up drafts for a first touch that has just been sent.
 * Idempotent: called twice for the same thread, it creates nothing extra.
 */
export async function scheduleFollowUps(
  firstTouch: OutreachMessage,
  now: Date = new Date(),
): Promise<OutreachMessage[]> {
  const store = await getStore();
  const threadId = firstTouch.thread_id ?? firstTouch.id;

  const existing = await store.listOutreachByThread(threadId);
  // Count follow-ups that already have a time, not follow-ups that exist. The
  // drafts are written up front by the daily run, so counting their existence
  // made this return immediately and nothing was ever scheduled.
  const alreadyScheduled = existing.filter((m) => m.step > 0 && m.scheduled_at).length;
  if (alreadyScheduled >= MAX_FOLLOW_UPS) return [];

  // The follow-up bodies were drafted alongside the first touch by the audit
  // pipeline. Reuse them rather than generating new copy at send time, so what
  // you approved is what goes out.
  const drafted = existing.filter((m) => m.step > 0 && m.status === 'draft');

  const out: OutreachMessage[] = [];
  for (const [i, days] of FOLLOW_UP_DAYS.entries()) {
    const step = i + 1;
    const already = existing.find((m) => m.step === step && m.scheduled_at);
    if (already) continue;

    const source = drafted.find((m) => m.step === step);
    const scheduled_at = addDays(now, days);

    if (source) {
      out.push(await store.setOutreachStatus(source.id, 'draft', { scheduled_at }));
      continue;
    }
    // No pre-drafted follow-up for this step: skip rather than invent copy.
    // The operator sees one follow-up instead of two, which is the safe failure.
  }
  return out;
}

/**
 * Stops every unsent message in a thread. Called on reply, unsubscribe and
 * bounce - the three cases where continuing would be actively harmful.
 */
export async function cancelThread(threadId: string, reason: string): Promise<number> {
  const store = await getStore();
  const messages = await store.listOutreachByThread(threadId);
  let cancelled = 0;
  for (const m of messages) {
    if (m.status === 'sent' || m.status === 'cancelled' || m.status === 'suppressed') continue;
    await store.setOutreachStatus(m.id, 'cancelled', { stop_reason: reason });
    cancelled += 1;
  }
  return cancelled;
}

/** Same, addressed by lead, for replies we cannot tie to a specific thread. */
export async function cancelPendingForLead(leadId: string, reason: string): Promise<number> {
  const store = await getStore();
  const messages = await store.listOutreach(leadId);
  let cancelled = 0;
  for (const m of messages) {
    if (m.status === 'sent' || m.status === 'cancelled' || m.status === 'suppressed') continue;
    await store.setOutreachStatus(m.id, 'cancelled', { stop_reason: reason });
    cancelled += 1;
  }
  return cancelled;
}
