import type { Lead, OutreachMessage } from '@/lib/types';

export interface SendRequest {
  message: OutreachMessage;
  lead: Lead;
  /** Verified destination. The engine resolves it; adapters never guess one. */
  to: string;
  from: { name: string; address: string };
  /** Appended by the engine; the adapter must include it verbatim. */
  unsubscribe_footer: string;
}

export interface SendResult {
  ok: boolean;
  /** Provider-side id, for correlating replies and bounces. */
  provider_message_id: string | null;
  error: string | null;
}

/**
 * One channel. Email is implemented; SMS and voice exist as the same shape so
 * adding them is wiring a provider, not reworking the engine.
 */
export interface ChannelAdapter {
  readonly channel: 'email' | 'sms' | 'voice';
  readonly name: string;
  /** False when the adapter lacks credentials or is not implemented yet. */
  available(): boolean;
  /** Human-readable reason when `available()` is false. */
  unavailableReason(): string | null;
  send(request: SendRequest): Promise<SendResult>;
}
