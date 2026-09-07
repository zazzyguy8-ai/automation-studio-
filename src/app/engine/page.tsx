import { getStore } from '@/lib/db';
import { engineDashboard } from '@/lib/engine/dashboard';
import { pickEmailAdapter, previewMessage, senderConfigProblems } from '@/lib/engine/send';
import { reviewOutreach } from '@/lib/outreach/build';
import { OutreachControls } from '@/components/lead-actions';
import {
  KillSwitch, LimitsForm, MarkHandled, ReplyForm, RunButtons, SuppressionForm,
} from '@/components/engine-controls';

export const dynamic = 'force-dynamic';

function Stat({ n, l, tone }: { n: number | string; l: string; tone?: 'good' | 'bad' | 'warn' }) {
  return (
    <div className="card stat">
      <div className="n" style={tone ? { color: `var(--${tone})` } : undefined}>{n}</div>
      <div className="l">{l}</div>
    </div>
  );
}

export default async function EnginePage() {
  const [d, store] = await Promise.all([engineDashboard(), getStore()]);
  const suppressions = await store.listSuppressions();
  const leads = (await store.listLeads()).slice(0, 60);
  const dryRun = pickEmailAdapter().name === 'dry-run';
  const configProblems = senderConfigProblems();

  return (
    <>
      <h2>Outreach engine</h2>
      <p className="sub">
        Find companies, audit them, draft the outreach — then stop and wait for you.
        Nothing is ever sent without your approval.
      </p>

      <KillSwitch on={d.engine.kill_switch} reason={d.engine.kill_switch_reason} />

      {configProblems.length > 0 && (
        <div className="banner bad">
          <strong>Sender not configured — email approval is blocked</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {configProblems.map((p, i) => <li key={i} className="small">{p}</li>)}
          </ul>
          <div className="small muted" style={{ marginTop: 8 }}>
            Set these in <span className="mono">.env.local</span> and restart. Without them the
            opt-out names no address, which every market this system maps requires.
          </div>
        </div>
      )}

      <div className="card">
        <RunButtons dryRun={dryRun} />
      </div>

      <h3>Today</h3>
      <div className="grid g4">
        <Stat n={`${d.engine.sent_today}/${d.engine.daily_send_cap}`} l="sent today / cap" />
        <Stat n={d.messages.awaiting_approval} l="awaiting approval" tone={d.messages.awaiting_approval > 0 ? 'warn' : undefined} />
        <Stat n={d.messages.approved_not_sent} l="approved, not sent" />
        <Stat n={d.messages.scheduled_follow_ups} l="follow-ups scheduled" />
      </div>

      <h3>Funnel</h3>
      <div className="grid g4">
        <Stat n={d.leads.total} l="leads" />
        <Stat n={d.messages.sent} l="sent" />
        <Stat n={d.replies.total - d.replies.bounce} l="replied" />
        <Stat n={d.replies.positive + d.replies.booked} l="positive" tone="good" />
        <Stat n={d.replies.booked} l="booked" tone="good" />
        <Stat n={d.replies.negative} l="rejected" />
        <Stat n={d.replies.unsubscribe} l="unsubscribed" tone="bad" />
        <Stat n={d.messages.cancelled} l="follow-ups stopped" />
      </div>
      <p className="small muted">
        Every figure above is counted from what actually happened — no estimates on this screen.
        Reply rate {d.replies.reply_rate_pct ?? '—'}% · positive rate {d.replies.positive_rate_pct ?? '—'}%
        {d.messages.failed > 0 && <> · <span style={{ color: 'var(--bad)' }}>{d.messages.failed} failed to send</span></>}
      </p>

      <h3>Rate limits</h3>
      <div className="card">
        <LimitsForm limits={{
          daily_send_cap: d.engine.daily_send_cap,
          hourly_send_cap: d.engine.hourly_send_cap,
          min_seconds_between_sends: d.engine.min_seconds_between_sends,
          quiet_hours_start: d.engine.quiet_hours_start,
          quiet_hours_end: d.engine.quiet_hours_end,
        }} />
        <p className="small muted" style={{ marginBottom: 0 }}>
          Conservative caps protect your sending domain. A new domain should warm up over weeks,
          not open at full volume.
          {d.engine.quiet_hours_start === d.engine.quiet_hours_end && (
            <> <strong>Quiet hours are off</strong> — time of day will not block sending. Every
            other gate (kill switch, caps, minimum gap, suppression, approval, sender config)
            is unaffected.</>
          )}
        </p>
      </div>

      <h3>Approval inbox ({d.inbox.length})</h3>
      {d.inbox.length === 0 && (
        <div className="card muted small">Nothing waiting. Run daily discovery to fill it.</div>
      )}
      {d.inbox.map(({ message, lead }) => {
        const review = reviewOutreach(message, lead);
        const to = lead.contacts.find((c) => c.kind === 'email');
        return (
          <div className="card" key={message.id}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong><a href={`/leads/${lead.id}`}>{lead.company_name}</a></strong>
              <span className="row">
                <span className="pill">{lead.country}</span>
                <span className="pill">step {message.step + 1}</span>
                {message.scheduled_at && (
                  <span className="pill warn">due {message.scheduled_at.slice(0, 10)}</span>
                )}
              </span>
            </div>
            <div className="small muted">
              to {to?.value ?? 'no verified address'}{' '}
              {to && (
                <span className={`pill ${to.label === 'found_on_site' ? 'good' : 'warn'}`}>
                  {to.label === 'found_on_site' ? 'verified on their site' : 'directory only'}
                </span>
              )}
            </div>
            {message.subject && <p style={{ marginBottom: 4 }}><strong>{message.subject}</strong></p>}
            <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{previewMessage(message.body).text}</p>
            <div className="small muted">
              {previewMessage(message.body).footer
                ? 'Above is the complete message, footer included — exactly what would be sent.'
                : 'No footer: the sender is not configured, so this cannot be approved.'}
            </div>
            <details>
              <summary className="small muted" style={{ cursor: 'pointer' }}>grounded in</summary>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }} className="small muted">
                {message.grounding.map((g, i) => <li key={i}>{g}</li>)}
              </ul>
            </details>
            <OutreachControls
              leadId={lead.id}
              messageId={message.id}
              status={message.status}
              blockers={review.blockers}
              warnings={review.warnings}
              requiresAck={review.requires_explicit_ack}
              marketNote={review.market.outreach_note}
            />
          </div>
        );
      })}

      <h3>Replies ({d.replies.unhandled} unread)</h3>
      <div className="card">
        <ReplyForm leads={leads.map((l) => ({ id: l.id, company_name: l.company_name }))} />
      </div>
      {d.recent_replies.map((r) => (
        <div className="card" key={r.id}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>
              <span className={`pill ${
                ['positive', 'booked'].includes(r.classification) ? 'good'
                  : ['unsubscribe', 'negative', 'bounce'].includes(r.classification) ? 'bad' : 'warn'
              }`}>{r.classification}</span>{' '}
              <span className="small muted">{r.from_address} · {r.received_at.slice(0, 16).replace('T', ' ')}</span>
            </span>
            <MarkHandled replyId={r.id} handled={r.handled} />
          </div>
          {r.subject && <div className="small"><strong>{r.subject}</strong></div>}
          <p className="small" style={{ whiteSpace: 'pre-wrap', marginBottom: 4 }}>{r.body}</p>
          <div className="small muted">classified because: {r.classification_reason}</div>
        </div>
      ))}

      <h3>Suppression list ({suppressions.length})</h3>
      <div className="card">
        <SuppressionForm />
        <p className="small muted">
          Checked when drafting and again at send time, because an opt-out can arrive in between.
        </p>
        {suppressions.length > 0 && (
          <table>
            <thead><tr><th>Value</th><th>Scope</th><th>Reason</th><th>Added</th></tr></thead>
            <tbody>
              {suppressions.map((s) => (
                <tr key={s.id}>
                  <td className="mono">{s.value}</td>
                  <td className="muted small">{s.scope}</td>
                  <td><span className="pill">{s.reason}</span></td>
                  <td className="muted small">{s.created_at.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
