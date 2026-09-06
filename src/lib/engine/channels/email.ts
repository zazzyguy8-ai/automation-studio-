import type { ChannelAdapter, SendRequest, SendResult } from './types';

/**
 * Email delivery.
 *
 * Two adapters share one interface:
 *
 *  - `DryRunEmailAdapter` records what would have been sent and sends nothing.
 *    This is the default, and it is what the tests and the demo run use. An
 *    outreach engine that can send on its first run is a liability.
 *  - `ResendEmailAdapter` is the real one, enabled by RESEND_API_KEY.
 *
 * Deliverability, not code, is the hard part of sending cold email: a new
 * domain needs SPF, DKIM, DMARC and a warm-up period before volume. The
 * conservative rate limits in the engine exist for that reason.
 */

export interface DeliveryRecord {
  to: string;
  subject: string | null;
  body: string;
  at: string;
}

export class DryRunEmailAdapter implements ChannelAdapter {
  readonly channel = 'email' as const;
  readonly name = 'dry-run';
  /** Everything "sent" in this process, so tests and the CLI can assert on it. */
  readonly outbox: DeliveryRecord[] = [];

  available(): boolean {
    return true;
  }

  unavailableReason(): string | null {
    return null;
  }

  async send(request: SendRequest): Promise<SendResult> {
    this.outbox.push({
      to: request.to,
      subject: request.message.subject,
      body: `${request.message.body}\n\n${request.unsubscribe_footer}`,
      at: new Date().toISOString(),
    });
    return { ok: true, provider_message_id: `dryrun-${this.outbox.length}`, error: null };
  }
}

export class ResendEmailAdapter implements ChannelAdapter {
  readonly channel = 'email' as const;
  readonly name = 'resend';
  private apiKey: string | undefined;
  private fetchImpl: typeof fetch;

  constructor(opts: { apiKey?: string; fetch?: typeof fetch } = {}) {
    this.apiKey = opts.apiKey ?? process.env.RESEND_API_KEY;
    this.fetchImpl = opts.fetch ?? fetch;
  }

  available(): boolean {
    return Boolean(this.apiKey);
  }

  unavailableReason(): string | null {
    return this.apiKey ? null : 'RESEND_API_KEY is not set';
  }

  async send(request: SendRequest): Promise<SendResult> {
    if (!this.apiKey) return { ok: false, provider_message_id: null, error: 'RESEND_API_KEY is not set' };

    try {
      const res = await this.fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: `${request.from.name} <${request.from.address}>`,
          to: [request.to],
          subject: request.message.subject ?? '(no subject)',
          text: `${request.message.body}\n\n${request.unsubscribe_footer}`,
          // One-click unsubscribe. Mailbox providers weigh this heavily, and it
          // is the difference between a reply and a spam folder.
          headers: {
            'List-Unsubscribe': `<mailto:${process.env.UNSUBSCRIBE_ADDRESS ?? request.from.address}?subject=unsubscribe>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        return { ok: false, provider_message_id: null, error: `HTTP ${res.status} ${detail.slice(0, 200)}` };
      }
      const body = (await res.json()) as { id?: string };
      return { ok: true, provider_message_id: body.id ?? null, error: null };
    } catch (err) {
      return { ok: false, provider_message_id: null, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
