import { getStore } from '@/lib/db';
import type { EngineState, Lead, OutreachMessage } from '@/lib/types';

/**
 * Everything that can stop a send, in one place.
 *
 * The ordering matters and is deliberate: the kill switch is checked first and
 * on every individual message, not once per batch. A switch that only takes
 * effect at the start of a run is not a kill switch.
 */

export interface GateResult {
  allowed: boolean;
  /** Machine-readable so the caller can decide between "skip" and "stop". */
  code:
    | 'ok'
    | 'kill_switch'
    | 'daily_cap'
    | 'hourly_cap'
    | 'too_soon'
    | 'quiet_hours'
    | 'suppressed'
    | 'not_approved'
    | 'not_due'
    | 'no_address';
  reason: string;
  /** True when the whole run should stop rather than skip this one message. */
  halt: boolean;
}

const ok: GateResult = { allowed: true, code: 'ok', reason: '', halt: false };

export function rolloverCounters(state: EngineState, now: Date): Partial<EngineState> | null {
  const today = now.toISOString().slice(0, 10);
  if (state.counter_date === today) return null;
  return { counter_date: today, sent_today: 0 };
}

/**
 * Quiet hours wrap midnight (e.g. 20 -> 8), so the comparison is not a simple
 * range. Setting start === end disables the window entirely.
 *
 * A caveat worth knowing before you switch it off: the hour compared here is
 * the SENDER's local time, not the recipient's. Sending UK prospects from a
 * machine in Bratislava already shifts the window by an hour, so this gate was
 * never a precise "do not disturb" - it is a coarse guard against sending at
 * 3am your time.
 */
export function inQuietHours(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/** Whether the time-of-day gate is active at all. */
export function quietHoursEnabled(state: Pick<EngineState, 'quiet_hours_start' | 'quiet_hours_end'>): boolean {
  return state.quiet_hours_start !== state.quiet_hours_end;
}

/** The two settings that turn the time-of-day gate off and on. */
export const QUIET_HOURS_OFF = { quiet_hours_start: 0, quiet_hours_end: 0 } as const;
export const QUIET_HOURS_DEFAULT = { quiet_hours_start: 20, quiet_hours_end: 8 } as const;

/**
 * Turns the time-of-day gate off or on.
 *
 * This is the only gate that can be disabled outright, and only because it
 * protects the recipient's evening rather than the integrity of the send.
 * Every other gate - kill switch, caps, minimum gap, suppression, approval,
 * sender configuration - stays in force regardless.
 */
export async function setQuietHours(enabled: boolean, window = QUIET_HOURS_DEFAULT) {
  const store = await getStore();
  return store.updateEngineState(enabled ? { ...window } : { ...QUIET_HOURS_OFF });
}

/** Address the engine may actually send to: verified, and never invented. */
export function resolveRecipient(lead: Lead, channel: OutreachMessage['channel']): string | null {
  if (channel !== 'email') return null;
  const emails = lead.contacts.filter((c) => c.kind === 'email');
  // Evidence on the company's own site beats a directory listing.
  return emails.find((c) => c.label === 'found_on_site')?.value ?? emails[0]?.value ?? null;
}

export interface SendGateInput {
  message: OutreachMessage;
  lead: Lead;
  now?: Date;
  /** Sends already made in this run, counted against the hourly cap. */
  sentThisRun?: number;
}

/**
 * Decides whether one specific message may go out right now.
 *
 * Returns `halt: true` for conditions that apply to the whole run (kill switch,
 * caps, quiet hours) and `halt: false` for conditions specific to this message
 * (suppressed, not approved, not due yet) where the run should move on.
 */
export async function checkSendGate(input: SendGateInput): Promise<GateResult> {
  const { message, lead } = input;
  const now = input.now ?? new Date();
  const store = await getStore();
  let state = await store.getEngineState();

  const rollover = rolloverCounters(state, now);
  if (rollover) state = await store.updateEngineState(rollover);

  if (state.kill_switch) {
    return {
      allowed: false, code: 'kill_switch', halt: true,
      reason: `Kill switch is on${state.kill_switch_reason ? `: ${state.kill_switch_reason}` : ''}.`,
    };
  }

  if (state.sent_today >= state.daily_send_cap) {
    return {
      allowed: false, code: 'daily_cap', halt: true,
      reason: `Daily cap reached (${state.sent_today}/${state.daily_send_cap}).`,
    };
  }

  if ((input.sentThisRun ?? 0) >= state.hourly_send_cap) {
    return {
      allowed: false, code: 'hourly_cap', halt: true,
      reason: `Hourly cap reached (${state.hourly_send_cap}).`,
    };
  }

  if (inQuietHours(now.getHours(), state.quiet_hours_start, state.quiet_hours_end)) {
    return {
      allowed: false, code: 'quiet_hours', halt: true,
      reason: `Quiet hours ${state.quiet_hours_start}:00-${state.quiet_hours_end}:00; queued instead.`,
    };
  }

  if (state.last_sent_at) {
    const gap = (now.getTime() - new Date(state.last_sent_at).getTime()) / 1000;
    if (gap < state.min_seconds_between_sends) {
      return {
        allowed: false, code: 'too_soon', halt: true,
        reason: `Only ${Math.round(gap)}s since the last send; minimum is ${state.min_seconds_between_sends}s.`,
      };
    }
  }

  // Per-message conditions: skip this one, keep the run going.
  if (message.status !== 'approved' && message.status !== 'queued') {
    return {
      allowed: false, code: 'not_approved', halt: false,
      reason: `Message is "${message.status}" - only approved messages are sent.`,
    };
  }

  if (message.scheduled_at && message.scheduled_at > now.toISOString()) {
    return {
      allowed: false, code: 'not_due', halt: false,
      reason: `Scheduled for ${message.scheduled_at}.`,
    };
  }

  const to = resolveRecipient(lead, message.channel);
  if (!to) {
    return {
      allowed: false, code: 'no_address', halt: false,
      reason: 'No verified address on this lead - we never guess one.',
    };
  }

  // Checked again here, not only at draft time: someone may have unsubscribed
  // between the draft being written and it being approved and sent.
  const suppressed = await store.isSuppressed(to);
  if (suppressed) {
    return {
      allowed: false, code: 'suppressed', halt: false,
      reason: `${to} is suppressed (${suppressed.reason}).`,
    };
  }

  return ok;
}

/** Flip the kill switch. Nothing sends while it is on. */
export async function setKillSwitch(on: boolean, reason: string | null = null) {
  const store = await getStore();
  return store.updateEngineState({ kill_switch: on, kill_switch_reason: on ? reason : null });
}

export async function recordSend(now: Date = new Date()) {
  const store = await getStore();
  const state = await store.getEngineState();
  return store.updateEngineState({
    sent_today: state.sent_today + 1,
    last_sent_at: now.toISOString(),
  });
}
