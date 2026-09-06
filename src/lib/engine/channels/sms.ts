import type { ChannelAdapter, SendRequest, SendResult } from './types';

/**
 * SMS - architecture only, deliberately not wired.
 *
 * The shape is finished so enabling it is a provider integration rather than an
 * engine change. What is NOT done, and what has to happen before this sends a
 * single message:
 *
 *  - number provisioning and sender registration per country (10DLC in the US,
 *    sender-ID rules across the EU) - weeks of lead time, not an afternoon;
 *  - STOP/HELP keyword handling at the provider AND mirrored into the
 *    suppression list here;
 *  - quiet hours in the recipient's timezone, not the sender's;
 *  - a per-country decision on whether cold SMS is lawful at all. It is
 *    markedly more restricted than email in DACH and the Nordics.
 *
 * Cold SMS to a business that never asked for it is a much stronger act than
 * cold email. Treat this as a channel for clients' agents first, and for your
 * own prospecting only where you have checked the rules.
 */
export class SmsAdapter implements ChannelAdapter {
  readonly channel = 'sms' as const;
  readonly name = 'telnyx-or-twilio';

  available(): boolean {
    return false;
  }

  unavailableReason(): string {
    return 'SMS is architecture-only: number provisioning, sender registration, STOP handling '
      + 'and a per-country legality check are all outstanding.';
  }

  async send(_request: SendRequest): Promise<SendResult> {
    return { ok: false, provider_message_id: null, error: this.unavailableReason() };
  }
}
