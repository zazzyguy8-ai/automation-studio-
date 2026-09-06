import { getStore } from '@/lib/db';
import { senderFromEnv } from '@/lib/outreach/build';
import type { OutreachMessage } from '@/lib/types';
import { DryRunEmailAdapter, ResendEmailAdapter } from './channels/email';
import type { ChannelAdapter } from './channels/types';
import { checkSendGate, recordSend, resolveRecipient } from './guards';
import { scheduleFollowUps } from './sequence';

/**
 * Sends approved messages, one at a time, through every guard.
 *
 * The engine never approves anything itself. It only picks up what a human has
 * already approved, and it re-checks the suppression list at send time because
 * an unsubscribe can land between approval and delivery.
 */

export function pickEmailAdapter(): ChannelAdapter {
  const resend = new ResendEmailAdapter();
  // Dry run unless a provider is explicitly configured AND sending is enabled.
  // Two switches, because "it started emailing real companies" is not a mistake
  // you get to make twice.
  if (resend.available() && process.env.OUTREACH_SENDING_ENABLED === 'true') return resend;
  return new DryRunEmailAdapter();
}

export function unsubscribeFooter(): string {
  const sender = senderFromEnv();
  const address = process.env.UNSUBSCRIBE_ADDRESS ?? process.env.SENDER_EMAIL ?? 'reply to this email';
  const postal = process.env.SENDER_POSTAL_ADDRESS;
  return [
    `${sender.name}, ${sender.company}`,
    postal ?? null,
    `Not relevant? Reply "unsubscribe" to ${address} and I will not contact you again.`,
  ].filter(Boolean).join('\n');
}

export interface SendRunResult {
  attempted: number;
  sent: number;
  skipped: Array<{ message_id: string; code: string; reason: string }>;
  halted: { code: string; reason: string } | null;
  adapter: string;
  dry_run: boolean;
}

export interface SendRunOptions {
  limit?: number;
  now?: Date;
  adapter?: ChannelAdapter;
}

export async function runSendQueue(opts: SendRunOptions = {}): Promise<SendRunResult> {
  const store = await getStore();
  const adapter = opts.adapter ?? pickEmailAdapter();
  const now = opts.now ?? new Date();
  const sender = senderFromEnv();
  const fromAddress = process.env.SENDER_EMAIL ?? 'noreply@example.invalid';

  const result: SendRunResult = {
    attempted: 0, sent: 0, skipped: [], halted: null,
    adapter: adapter.name, dry_run: adapter.name === 'dry-run',
  };

  if (!adapter.available()) {
    result.halted = { code: 'adapter_unavailable', reason: adapter.unavailableReason() ?? 'adapter unavailable' };
    return result;
  }

  // Report the kill switch up front. The per-message gate checks it too, so
  // this is not the thing that makes it safe - it is what stops an empty queue
  // reporting "nothing to do" when the real answer is "we are stopped".
  const state = await store.getEngineState();
  if (state.kill_switch) {
    result.halted = {
      code: 'kill_switch',
      reason: `Kill switch is on${state.kill_switch_reason ? `: ${state.kill_switch_reason}` : ''}.`,
    };
    return result;
  }

  const queue = await store.listSendable(now.toISOString(), opts.limit ?? 50);

  for (const message of queue) {
    const lead = await store.getLead(message.lead_id);
    if (!lead) {
      result.skipped.push({ message_id: message.id, code: 'no_lead', reason: 'lead not found' });
      continue;
    }

    const gate = await checkSendGate({ message, lead, now, sentThisRun: result.sent });
    if (!gate.allowed) {
      if (gate.halt) {
        result.halted = { code: gate.code, reason: gate.reason };
        break;
      }
      result.skipped.push({ message_id: message.id, code: gate.code, reason: gate.reason });
      // A suppressed message is closed out, not left to be retried forever.
      if (gate.code === 'suppressed') {
        await store.setOutreachStatus(message.id, 'suppressed', { stop_reason: gate.reason });
      }
      continue;
    }

    const to = resolveRecipient(lead, message.channel)!;
    result.attempted += 1;

    const send = await adapter.send({
      message,
      lead,
      to,
      from: { name: sender.name, address: fromAddress },
      unsubscribe_footer: unsubscribeFooter(),
    });

    if (!send.ok) {
      await store.setOutreachStatus(message.id, 'failed', { stop_reason: send.error ?? 'send failed' });
      result.skipped.push({ message_id: message.id, code: 'send_failed', reason: send.error ?? 'unknown' });
      continue;
    }

    await store.setOutreachStatus(message.id, 'sent', { sent_to: to, sent_at: now.toISOString() });
    await recordSend(now);
    result.sent += 1;

    // The first touch schedules its own follow-ups. Doing it here rather than
    // at draft time means a message that never went out never generates any.
    if (message.step === 0) await scheduleFollowUps(message, now);

    if (lead.stage === 'new' || lead.stage === 'audited') {
      await store.setLeadStage(lead.id, 'contacted');
    }
  }

  return result;
}

/** Queue an approved message for the next send run. */
export async function queueMessage(id: string, scheduledAt: string | null = null): Promise<OutreachMessage> {
  const store = await getStore();
  const message = await store.getOutreach(id);
  if (!message) throw new Error(`message ${id} not found`);
  if (message.status !== 'approved') {
    throw new Error(`only approved messages can be queued (this one is "${message.status}")`);
  }
  return store.setOutreachStatus(id, 'queued', { scheduled_at: scheduledAt });
}
