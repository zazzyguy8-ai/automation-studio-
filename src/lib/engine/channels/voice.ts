import type { ChannelAdapter, SendRequest, SendResult } from './types';

/**
 * Voice - architecture only, deliberately not wired.
 *
 * Outstanding before this can place a call:
 *
 *  - call recording consent, which differs by country and in the US by state;
 *  - an AI-disclosure line at the start of every call;
 *  - do-not-call register checks (TPS in the UK, Robinson lists in DACH,
 *    the National DNC Registry in the US) before dialling anything;
 *  - a defined human transfer path, because an automated cold call with no
 *    escape hatch is the worst version of this product.
 *
 * Automated cold calling is the most heavily regulated channel here by a wide
 * margin. Its natural home is a client's inbound receptionist agent, not
 * outbound prospecting.
 */
export class VoiceAdapter implements ChannelAdapter {
  readonly channel = 'voice' as const;
  readonly name = 'telnyx-voice';

  available(): boolean {
    return false;
  }

  unavailableReason(): string {
    return 'Voice is architecture-only: recording consent, AI disclosure, do-not-call checks '
      + 'and a human transfer path are all outstanding.';
  }

  async send(_request: SendRequest): Promise<SendResult> {
    return { ok: false, provider_message_id: null, error: this.unavailableReason() };
  }
}
