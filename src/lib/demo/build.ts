import { getStore } from '@/lib/db';
import { computeImpact, presetInputs, type ImpactInputs } from '@/lib/estimate/model';
import { getProvider } from '@/lib/llm';
import type { Audit, Demo, Lead } from '@/lib/types';

/**
 * Turns a passed audit into a personalised demo: a Before/After the dashboard
 * renders, a scene-by-scene script to read over a screen recording, and the
 * impact estimates - each carrying its own assumptions.
 */
export async function buildDemo(
  lead: Lead,
  audit: Audit,
  overrides: Partial<ImpactInputs> = {},
): Promise<Demo> {
  if (audit.status !== 'ok' || !audit.result) {
    throw new Error(`cannot build a demo from a ${audit.status} audit`);
  }

  const store = await getStore();
  const snapshot = await store.latestSnapshot(lead.id);
  const inputs: ImpactInputs = {
    ...presetInputs(lead.industry, snapshot?.signals),
    ...overrides,
  };

  const script = await getProvider().writeDemoScript({ lead, audit: audit.result });

  return store.insertDemo({
    audit_id: audit.id,
    lead_id: lead.id,
    headline: script.headline,
    before: script.before,
    after: script.after,
    scenes: script.scenes,
    impact: computeImpact(audit.result, inputs),
    impact_inputs: inputs as unknown as Record<string, number>,
    created_at: new Date().toISOString(),
  });
}
