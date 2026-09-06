import { notFound } from 'next/navigation';
import { getStore } from '@/lib/db';
import { outreachBlockers } from '@/lib/outreach/build';
import { paybackMonths } from '@/lib/estimate/model';
import { EstimateCard } from '@/components/estimate-card';
import {
  BuildDemoButton, BuildOutreachButtons, OutreachControls, StageSelect, WinClientForm,
} from '@/components/lead-actions';

export const dynamic = 'force-dynamic';

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = await getStore();
  const lead = await store.getLead(id);
  if (!lead) notFound();

  const [snapshot, audit, demo, outreach, clients] = await Promise.all([
    store.latestSnapshot(id), store.latestAudit(id), store.latestDemo(id),
    store.listOutreach(id), store.listClients(),
  ]);
  const client = clients.find((c) => c.lead_id === id);
  const result = audit?.status === 'ok' ? audit.result : null;
  const winner = result?.opportunities.find((o) => o.id === result.recommended_opportunity_id);
  const winningProblem = result?.problems.find((p) => p.id === winner?.problem_id);

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h2>{lead.company_name}</h2>
          <p className="sub">
            <a href={lead.website} target="_blank" rel="noreferrer">{lead.website}</a>
            {lead.industry && <> · {lead.industry}</>}
            {lead.country && <> · {lead.country}</>}
          </p>
        </div>
        <StageSelect leadId={lead.id} stage={lead.stage} />
      </div>

      {/* 1 — PROSPECTING ------------------------------------------------ */}
      <h3>1 · Enrichment</h3>
      <div className="card">
        <div className="grid g3">
          <div>
            <h4>Contacts</h4>
            {lead.contacts.length === 0 ? <span className="muted small">none found</span> : (
              <ul style={{ margin: 0, paddingLeft: 16 }} className="small">
                {lead.contacts.map((c, i) => <li key={i}>{c.kind}: {c.value}</li>)}
              </ul>
            )}
          </div>
          <div>
            <h4>Socials</h4>
            {lead.socials.length === 0 ? <span className="muted small">none found</span> : (
              <ul style={{ margin: 0, paddingLeft: 16 }} className="small">
                {lead.socials.map((s, i) => <li key={i}><a href={s.url} target="_blank" rel="noreferrer">{s.platform}</a></li>)}
              </ul>
            )}
          </div>
          <div>
            <h4>Observed on the site</h4>
            {snapshot ? (
              <ul style={{ margin: 0, paddingLeft: 16 }} className="small">
                <li>contact form: {String(snapshot.signals.has_contact_form)}</li>
                <li>online booking: {String(snapshot.signals.has_online_booking)}
                  {snapshot.signals.booking_vendors.length > 0 && ` (${snapshot.signals.booking_vendors.join(', ')})`}</li>
                <li>live chat: {String(snapshot.signals.has_live_chat)}</li>
                <li>pages read: {snapshot.pages.length}</li>
                <li>size hint: {lead.size_hint ?? 'unknown'}</li>
              </ul>
            ) : <span className="muted small">no snapshot yet</span>}
          </div>
        </div>
        {snapshot && snapshot.signals.response_promises.length > 0 && (
          <>
            <h4>Response promises they make publicly</h4>
            {snapshot.signals.response_promises.map((p, i) => <div key={i} className="quote small">{p}</div>)}
          </>
        )}
      </div>

      {/* 2 — AUDIT ------------------------------------------------------- */}
      <h3>2 · Audit</h3>
      {!audit && <div className="card muted small">No audit yet.</div>}
      {audit && audit.status !== 'ok' && (
        <div className="banner bad">
          <strong>Audit rejected by the quality gate ({audit.status}).</strong> It is stored but will not be shown to a prospect.
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {(audit.gate_report.length ? audit.gate_report : [audit.error ?? 'unknown']).map((g, i) => (
              <li key={i} className="small">{g}</li>
            ))}
          </ul>
        </div>
      )}

      {result && (
        <>
          <div className="card">
            <p style={{ marginTop: 0 }}>{result.business_profile.what_they_do}</p>
            <div className="row small muted">
              <span>customers: {result.business_profile.customer_type}</span>
              <span>· booking: {result.business_profile.booking_model}</span>
              <span>· intake: {result.business_profile.intake_channels.join(', ') || 'unclear'}</span>
            </div>
            <div className="muted small" style={{ marginTop: 8 }}>
              model: <span className="mono">{audit!.model}</span> · {new Date(audit!.created_at).toLocaleString('en-GB')}
            </div>
          </div>

          <h4>Problems, each quoting their own site</h4>
          {result.problems.map((p) => (
            <div className="card" key={p.id}>
              <strong>{p.title}</strong>
              <p className="small" style={{ marginBottom: 6 }}>{p.description}</p>
              <p className="small muted" style={{ margin: '0 0 8px' }}>
                <em>Why it costs money (hypothesis):</em> {p.revenue_leak_hypothesis}
              </p>
              {p.evidence.map((e, i) => (
                <div key={i} className="quote small">
                  “{e.quote}” — <a href={e.url} target="_blank" rel="noreferrer">{e.url}</a>
                </div>
              ))}
            </div>
          ))}

          <h4>Scored automation options</h4>
          <div className="card">
            <table>
              <thead>
                <tr><th>Option</th><th>ROI</th><th>Effort</th><th>Urgency</th><th>Score</th></tr>
              </thead>
              <tbody>
                {result.opportunities.map((o) => (
                  <tr key={o.id} style={o.id === result.recommended_opportunity_id ? { background: 'var(--panel-2)' } : undefined}>
                    <td>
                      {o.id === result.recommended_opportunity_id && <span className="pill good">recommended</span>}{' '}
                      {o.title}
                      <div className="muted small">{o.roi.driver_metric}</div>
                    </td>
                    <td>{o.roi.score}/10</td>
                    <td>{o.effort.score}/10<div className="muted small">{o.effort.build_days}d</div></td>
                    <td>{o.urgency.score}/10</td>
                    <td><strong>{o.total_score}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="small muted" style={{ marginBottom: 0 }}>{result.recommendation_rationale}</p>
          </div>

          {winner && (
            <>
              <h4>The workflow we would build</h4>
              <div className="card">
                <strong>{winner.title}</strong>
                {winningProblem && <p className="small muted">Solves: {winningProblem.title}</p>}
                <ul className="steps">
                  {winner.workflow_steps.map((s, i) => (
                    <li key={i}>
                      <span className="actor">{s.actor}</span>
                      <span>
                        {s.action}
                        <div className="muted small">
                          {[s.channel && `channel: ${s.channel}`, s.integration && `via ${s.integration}`, s.sla && `target ${s.sla}`]
                            .filter(Boolean).join(' · ') || '—'}
                        </div>
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="row small muted" style={{ marginTop: 10 }}>
                  integrations: {winner.integrations.join(', ')}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* 3 — DEMO -------------------------------------------------------- */}
      <h3>3 · Personalised demo</h3>
      {!demo && result && <div className="card"><BuildDemoButton leadId={lead.id} /></div>}
      {!demo && !result && <div className="card muted small">Needs a passed audit first.</div>}

      {demo && (
        <>
          <div className="card">
            <strong>{demo.headline}</strong>
            <div className="grid g2" style={{ marginTop: 14 }}>
              <div>
                <h4>Before</h4>
                <ul style={{ margin: 0, paddingLeft: 16 }} className="small">
                  {demo.before.map((b, i) => <li key={i}>{b}</li>)}
                </ul>
              </div>
              <div>
                <h4>After</h4>
                <ul style={{ margin: 0, paddingLeft: 16 }} className="small">
                  {demo.after.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              </div>
            </div>
          </div>

          <div className="card">
            <h4 style={{ marginTop: 0 }}>Impact — every figure below is an estimate</h4>
            <p className="small muted">
              These are computed from stated planning assumptions, not from this company&apos;s data.
              Replace the assumptions with their real numbers on the first call.
            </p>
            <div className="grid g2">
              {demo.impact.map((e, i) => <EstimateCard key={i} estimate={e} />)}
              {client?.build_fee_eur != null && client?.monthly_fee_eur != null && (
                <EstimateCard estimate={paybackMonths(demo.impact, client.build_fee_eur, client.monthly_fee_eur)} />
              )}
            </div>
          </div>

          <div className="card">
            <h4 style={{ marginTop: 0 }}>Script to read over the screen recording</h4>
            <table>
              <thead><tr><th style={{ width: 90 }}>Time</th><th>On screen</th><th>Say</th></tr></thead>
              <tbody>
                {demo.scenes.map((s, i) => (
                  <tr key={i}>
                    <td className="mono">{s.t}</td>
                    <td className="small muted">{s.on_screen}</td>
                    <td className="small">{s.narration}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 4 — OUTREACH ---------------------------------------------------- */}
      <h3>4 · Outreach</h3>
      <div className="card">
        <p className="small muted" style={{ marginTop: 0 }}>
          Everything is generated as a draft from this specific audit. Nothing is sent by this system —
          you approve copy, send it yourself, then mark it sent.
        </p>
        <BuildOutreachButtons leadId={lead.id} hasDemo={Boolean(demo)} />
      </div>

      {outreach.map((m) => {
        const blockers = outreachBlockers(m, lead);
        return (
          <div className="card" key={m.id}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="pill">{m.channel} · step {m.step + 1}</span>
              <span className={`pill ${m.status === 'sent' ? 'good' : m.status === 'rejected' ? 'bad' : ''}`}>{m.status}</span>
            </div>
            {m.subject && <p style={{ marginBottom: 4 }}><strong>{m.subject}</strong></p>}
            <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{m.body}</p>
            <details>
              <summary className="small muted" style={{ cursor: 'pointer' }}>grounded in</summary>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }} className="small muted">
                {m.grounding.map((g, i) => <li key={i}>{g}</li>)}
              </ul>
            </details>
            <OutreachControls leadId={lead.id} messageId={m.id} status={m.status} blockers={blockers} />
          </div>
        );
      })}

      {/* 5 — WON --------------------------------------------------------- */}
      <h3>5 · Won</h3>
      <div className="card">
        {client ? (
          <p style={{ margin: 0 }}>
            Client created: <a href={`/clients/${client.id}`}>{client.name}</a>
            {' '}· build EUR {client.build_fee_eur ?? '—'} · EUR {client.monthly_fee_eur ?? '—'}/month
          </p>
        ) : (
          <WinClientForm leadId={lead.id} />
        )}
      </div>
    </>
  );
}
