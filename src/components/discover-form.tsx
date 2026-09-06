'use client';

import { useState } from 'react';
import { PRIORITY_MARKETS, MARKETS } from '@/lib/discovery/markets';
import { industryOptions } from '@/lib/discovery/taxonomy';

interface RunResult {
  provider: string;
  resolved_area: string;
  market: { name: string; country: string; outreach_risk: string; outreach_note: string; outreach_language: string };
  summary: { found: number; verified: number; ready_for_audit: number; saved: number };
  results: Array<{
    lead: { id: string; company_name: string } | null;
    ready_for_audit: boolean;
    rejected_reason: string | null;
    company: {
      name: string; website: string | null;
      sources: Array<{ source_url: string; provider: string }>;
      contacts: Array<{ kind: string; value: string; verification: string; evidence_url: string | null }>;
      verification: { website_reachable: boolean; website_error: string | null; name_matches_site: boolean };
    };
  }>;
  skipped: Array<{ name: string; reason: string }>;
}

const riskClass = (r: string) => (r === 'low' ? 'good' : r === 'high' ? 'bad' : 'warn');

export function DiscoverForm() {
  const [industry, setIndustry] = useState('car repair');
  const [country, setCountry] = useState('GB');
  const [city, setCity] = useState('Manchester');
  const [limit, setLimit] = useState('15');
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<RunResult | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setRun(null);
    try {
      const res = await fetch('/api/discover', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ industry, country, city: city || null, limit: Number(limit), offline }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'hľadanie zlyhalo');
      setRun(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form className="card" onSubmit={submit}>
        <div className="grid g4">
          <label>
            <div className="small muted">Odvetvie</div>
            <input
              required list="industries" style={{ width: '100%' }}
              value={industry} onChange={(e) => setIndustry(e.target.value)}
              placeholder="car repair / Zahnarzt / roofing"
            />
            <datalist id="industries">
              {industryOptions().map((i) => <option key={i.key} value={i.label} />)}
            </datalist>
          </label>
          <label>
            <div className="small muted">Krajina</div>
            <select style={{ width: '100%' }} value={country} onChange={(e) => setCountry(e.target.value)}>
              <optgroup label="Prioritné trhy">
                {PRIORITY_MARKETS.map((m) => <option key={m.country} value={m.country}>{m.country} — {m.name}</option>)}
              </optgroup>
              <optgroup label="Ostatné zmapované">
                {MARKETS.filter((m) => m.priority > 1).map((m) => (
                  <option key={m.country} value={m.country}>{m.country} — {m.name}</option>
                ))}
              </optgroup>
            </select>
          </label>
          <label>
            <div className="small muted">Mesto (odporúčané)</div>
            <input style={{ width: '100%' }} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Manchester" />
          </label>
          <label>
            <div className="small muted">Max. firiem</div>
            <input style={{ width: '100%' }} value={limit} onChange={(e) => setLimit(e.target.value)} />
          </label>
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="primary" disabled={busy || !industry || !country}>
            {busy ? 'Hľadám a overujem…' : 'Nájsť firmy'}
          </button>
          <label className="small muted row" style={{ gap: 6 }}>
            <input type="checkbox" checked={offline} onChange={(e) => setOffline(e.target.checked)} />
            offline ukážka (bez siete)
          </label>
          <span className="muted small">Nič sa neodosiela. Firmy sa uložia ako leady v stave „new“.</span>
        </div>
        {error && <div className="banner bad" style={{ marginTop: 14 }}>{error}</div>}
      </form>

      {run && (
        <>
          <div className={`banner ${riskClass(run.market.outreach_risk)}`}>
            <strong>{run.market.name} — outreach riziko {run.market.outreach_risk.toUpperCase()}</strong>
            <div className="small" style={{ marginTop: 6 }}>{run.market.outreach_note}</div>
            <div className="small muted" style={{ marginTop: 6 }}>
              Jazyk outreachu: {run.market.outreach_language} · zdroj: {run.provider} · oblasť: {run.resolved_area}
            </div>
          </div>

          <div className="grid g4">
            <div className="card stat"><div className="n">{run.summary.found}</div><div className="l">nájdené</div></div>
            <div className="card stat"><div className="n">{run.summary.verified}</div><div className="l">web dostupný</div></div>
            <div className="card stat"><div className="n">{run.summary.ready_for_audit}</div><div className="l">pripravené na audit</div></div>
            <div className="card stat"><div className="n">{run.summary.saved}</div><div className="l">uložené ako lead</div></div>
          </div>

          {run.results.map((r, i) => (
            <div className="card" key={i}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>
                  {r.lead ? <a href={`/leads/${r.lead.id}`}>{r.company.name}</a> : r.company.name}
                </strong>
                {r.lead
                  ? <span className="pill good">uložené</span>
                  : <span className="pill bad">vynechané</span>}
              </div>
              {r.company.website && (
                <div className="small">
                  <a href={r.company.website} target="_blank" rel="noreferrer">{r.company.website}</a>
                </div>
              )}
              {r.rejected_reason && <div className="small muted">dôvod: {r.rejected_reason}</div>}

              {!r.company.verification.name_matches_site && r.company.verification.website_reachable && (
                <div className="banner warn" style={{ marginTop: 8 }}>
                  Názov firmy sa na uvedenom webe nepodarilo potvrdiť. Over ručne, či ten web naozaj patrí jej.
                </div>
              )}

              <h4>Kontakty</h4>
              {r.company.contacts.length === 0 ? (
                <span className="muted small">žiadne overené kontakty</span>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 16 }} className="small">
                  {r.company.contacts.map((c, j) => (
                    <li key={j}>
                      {c.kind}: {c.value}{' '}
                      <span className={`pill ${c.verification === 'found_on_site' ? 'good' : 'warn'}`}>
                        {c.verification === 'found_on_site' ? 'na webe firmy' : 'len z adresára'}
                      </span>
                      {c.evidence_url && (
                        <> <a className="muted" href={c.evidence_url} target="_blank" rel="noreferrer">dôkaz</a></>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <h4>Zdroje</h4>
              <ul style={{ margin: 0, paddingLeft: 16 }} className="small muted">
                {r.company.sources.map((s, j) => (
                  <li key={j}>{s.provider}: <a href={s.source_url} target="_blank" rel="noreferrer">{s.source_url}</a></li>
                ))}
              </ul>
            </div>
          ))}

          {run.skipped.length > 0 && (
            <div className="card">
              <h4 style={{ marginTop: 0 }}>Vynechané ešte pred overením</h4>
              <ul style={{ margin: 0, paddingLeft: 16 }} className="small muted">
                {run.skipped.map((s, i) => <li key={i}>{s.name} — {s.reason}</li>)}
              </ul>
            </div>
          )}
        </>
      )}
    </>
  );
}
