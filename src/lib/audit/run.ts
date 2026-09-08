import { getStore } from '@/lib/db';
import { getProvider } from '@/lib/llm';
import { rank } from '@/lib/llm/heuristic';
import { auditModel } from '@/lib/llm/models';
import { contactsFromSnapshot, crawlSite, mergeContacts, normalizeUrl, sizeHint, type Fetcher } from '@/lib/scrape/crawl';
import type { Audit, Lead, Snapshot } from '@/lib/types';
import { gateAudit } from './gate';

export interface AuditRequest {
  website: string;
  company_name?: string;
  industry?: string | null;
  country?: string | null;
  source?: string;
  /** Test hook: swap the network for fixtures. */
  fetcher?: Fetcher;
}

export interface AuditRun {
  lead: Lead;
  snapshot: Snapshot;
  audit: Audit;
}

function companyNameFrom(website: string, title: string | undefined): string {
  const fromTitle = title?.split(/[|\-–—:]/)[0]?.trim();
  if (fromTitle && fromTitle.length >= 3 && fromTitle.length <= 60) return fromTitle;
  return new URL(normalizeUrl(website)).hostname.replace(/^www\./, '');
}

/**
 * URL in, stored audit out. Crawl -> enrich the CRM record -> reason -> gate.
 * A rejected audit is persisted with its reasons rather than thrown away, so
 * the failure mode is visible instead of silent.
 */
export async function runAudit(req: AuditRequest): Promise<AuditRun> {
  const store = await getStore();
  const website = normalizeUrl(req.website);

  const crawled = await crawlSite(website, { fetcher: req.fetcher });
  const existing = await store.findLeadByWebsite(website);

  const lead = await store.upsertLead({
    id: existing?.id,
    company_name: req.company_name ?? existing?.company_name ?? companyNameFrom(website, crawled.pages[0]?.title),
    website,
    industry: req.industry ?? existing?.industry ?? null,
    country: req.country ?? existing?.country ?? null,
    size_hint: sizeHint(crawled),
    stage: existing?.stage ?? 'new',
    contacts: mergeContacts(existing?.contacts ?? [], contactsFromSnapshot(crawled.signals, website)),
    socials: crawled.signals.social_links,
    notes: existing?.notes ?? null,
    source: req.source ?? existing?.source ?? 'manual',
  });

  const snapshot = await store.insertSnapshot({ ...crawled, lead_id: lead.id });
  const provider = getProvider();
  const model = provider.name === 'anthropic' ? auditModel() : 'heuristic';

  let audit: Audit;
  try {
    const result = await provider.analyzeBusiness({ lead, snapshot });
    // Sort by the same score the UI shows, so "the recommendation" is never
    // a different opportunity from the one at the top of the list.
    const ranked = rank(result.opportunities);
    const ordered = { ...result, opportunities: ranked };
    const gate = gateAudit(ordered, snapshot, lead.company_name);

    audit = await store.insertAudit({
      lead_id: lead.id,
      snapshot_id: snapshot.id,
      model,
      status: gate.ok ? 'ok' : 'rejected',
      result: ordered,
      gate_report: gate.problems,
      error: null,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    audit = await store.insertAudit({
      lead_id: lead.id,
      snapshot_id: snapshot.id,
      model,
      status: 'error',
      result: null,
      gate_report: [],
      error: err instanceof Error ? err.message : String(err),
      created_at: new Date().toISOString(),
    });
    return { lead, snapshot, audit };
  }

  if (audit.status === 'ok' && lead.stage === 'new') {
    await store.setLeadStage(lead.id, 'audited');
  }
  return { lead: (await store.getLead(lead.id))!, snapshot, audit };
}
