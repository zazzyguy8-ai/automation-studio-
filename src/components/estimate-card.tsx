import type { Estimate } from '@/lib/types';

/**
 * The only component allowed to render an impact number.
 *
 * It always prints the range, always prints the "estimate" marker, and always
 * prints the assumptions underneath. There is deliberately no prop that turns
 * any of that off, so a number cannot end up on screen looking like a fact.
 */
export function EstimateCard({ estimate }: { estimate: Estimate }) {
  const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString('en-GB') : n.toLocaleString('en-GB', { maximumFractionDigits: 1 }));
  return (
    <div className="estimate">
      <div className="small muted">{estimate.label}</div>
      <div className="v">
        {fmt(estimate.low)}–{fmt(estimate.high)} <span className="small muted">{estimate.unit}</span>
      </div>
      <div className="small muted">
        central case {fmt(estimate.base)} · <span className="pill warn">estimate ({estimate.confidence})</span>
      </div>
      <details className="why">
        <summary style={{ cursor: 'pointer' }}>what this assumes</summary>
        <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          {estimate.assumptions.map((a, i) => <li key={i}>{a}</li>)}
        </ul>
      </details>
    </div>
  );
}
