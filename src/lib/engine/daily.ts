import { runAudit } from '@/lib/audit/run';
import { getStore } from '@/lib/db';
import { buildDemo } from '@/lib/demo/build';
import { runDiscovery, type DiscoveryOptions } from '@/lib/discovery/run';
import { getMarket } from '@/lib/discovery/markets';
import { buildOutreachSequence } from '@/lib/outreach/build';
import type { Fetcher } from '@/lib/scrape/crawl';
import type { Campaign, Lead, Opportunity, OutreachMessage } from '@/lib/types';
import { MAX_FOLLOW_UPS } from './sequence';

/**
 * The daily run: find companies, audit them, keep the best, draft outreach.
 *
 * It stops at the approval inbox. Nothing here approves or sends - the drafts
 * simply appear, and you decide. That boundary is the whole point: the engine
 * removes the hours of research and writing, not the judgement about who is
 * worth contacting.
 */

export interface DailyRunOptions {
  now?: Date;
  /** Injectable transports for tests and offline runs. */
  searchFetch?: typeof fetch;
  siteFetcher?: Fetcher;
  provider?: DiscoveryOptions['provider'];
  /** Cap the audit work; auditing 50 sites with Claude is slow and not free. */
  maxAudits?: number;
}

export interface SelectedLead {
  lead: Lead;
  /** The single automation we would sell them. */
  opportunity: Opportunity;
  /** Score the engine ranked on. */
  score: number;
  drafts: OutreachMessage[];
}

export interface DailyRunResult {
  campaign: Campaign;
  discovered: number;
  saved_leads: number;
  audited: number;
  audit_rejected: number;
  selected: SelectedLead[];
  /** Companies dropped before drafting, with the reason. */
  dropped: Array<{ company: string; reason: string }>;
  /** True when the market needs an explicit acknowledgement before approval. */
  market_requires_ack: boolean;
  market_note: string;
}

/**
 * Ranks an audited lead. Deliberately simple and readable: the audit already
 * scored the opportunity, and this only adds how contactable they are. An
 * opaque ranking would make it impossible to tell why a bad lead surfaced.
 */
export function scoreLead(lead: Lead, opportunity: Opportunity): number {
  const base = opportunity.total_score ?? 0;
  const hasVerifiedEmail = lead.contacts.some((c) => c.kind === 'email' && c.label === 'found_on_site');
  const hasAnyEmail = lead.contacts.some((c) => c.kind === 'email');
  // No verified address means the draft has nowhere to go, so it ranks last
  // however good the opportunity looks.
  const contactability = hasVerifiedEmail ? 2 : hasAnyEmail ? 0.5 : -5;
  return Number((base + contactability).toFixed(2));
}

export async function runDailyCampaign(
  campaign: Campaign,
  opts: DailyRunOptions = {},
): Promise<DailyRunResult> {
  const store = await getStore();
  const market = getMarket(campaign.country);

  const discovery = await runDiscovery(
    {
      industry: campaign.industry,
      country: campaign.country,
      city: campaign.city,
      limit: campaign.daily_target,
      requireWebsite: true,
    },
    {
      provider: opts.provider ?? 'auto',
      verify: true,
      searchFetch: opts.searchFetch,
      siteFetcher: opts.siteFetcher,
    },
  );

  const dropped: DailyRunResult['dropped'] = [
    ...discovery.skipped.map((s) => ({ company: s.name, reason: s.reason })),
    ...discovery.results.filter((r) => !r.lead)
      .map((r) => ({ company: r.company.name, reason: r.rejected_reason ?? 'not saved' })),
  ];

  const candidates = discovery.results.filter((r) => r.lead && r.ready_for_audit);
  const maxAudits = opts.maxAudits ?? campaign.daily_target;

  const audited: SelectedLead[] = [];
  let auditRejected = 0;

  for (const candidate of candidates.slice(0, maxAudits)) {
    const lead = candidate.lead!;

    // Never re-contact someone already in the pipeline past 'new'.
    if (lead.stage !== 'new') {
      dropped.push({ company: lead.company_name, reason: `already at stage "${lead.stage}"` });
      continue;
    }

    // Suppression is checked here as well as at send time, so a suppressed
    // company never even costs an audit.
    const email = lead.contacts.find((c) => c.kind === 'email')?.value;
    if (email && await store.isSuppressed(email)) {
      dropped.push({ company: lead.company_name, reason: `${email} is on the suppression list` });
      continue;
    }

    const run = await runAudit({
      website: lead.website,
      company_name: lead.company_name,
      industry: campaign.industry,
      country: campaign.country,
      source: `campaign:${campaign.id}`,
      fetcher: opts.siteFetcher,
    });

    if (run.audit.status !== 'ok' || !run.audit.result) {
      auditRejected += 1;
      dropped.push({
        company: lead.company_name,
        reason: `audit ${run.audit.status}: ${(run.audit.gate_report[0] ?? run.audit.error ?? 'unknown')}`,
      });
      continue;
    }

    const result = run.audit.result;
    const opportunity = result.opportunities.find((o) => o.id === result.recommended_opportunity_id)!;
    audited.push({
      lead: run.lead,
      opportunity,
      score: scoreLead(run.lead, opportunity),
      drafts: [],
    });
  }

  // Best first, then take only as many as the campaign is willing to send.
  audited.sort((a, b) => b.score - a.score);
  const selected = audited.slice(0, campaign.daily_send_cap);

  for (const entry of selected) {
    const audit = await store.latestAudit(entry.lead.id);
    if (!audit || audit.status !== 'ok') continue;

    const demo = await buildDemo(entry.lead, audit);
    // First touch plus the follow-ups, drafted together so what you approve is
    // what eventually goes out.
    const drafts = await buildOutreachSequence(
      entry.lead, audit, demo, 'email', 1 + MAX_FOLLOW_UPS,
    );

    // Tie them into one thread so a single reply can cancel all of them.
    const threadId = drafts[0].id;
    const linked: OutreachMessage[] = [];
    for (const draft of drafts) {
      linked.push(await store.setOutreachStatus(draft.id, 'draft', {
        thread_id: threadId,
        campaign_id: campaign.id,
      }));
    }
    entry.drafts = linked;
  }

  return {
    campaign,
    discovered: discovery.summary.found,
    saved_leads: discovery.summary.saved,
    audited: audited.length,
    audit_rejected: auditRejected,
    selected,
    dropped,
    market_requires_ack: market.outreach_risk === 'high',
    market_note: market.outreach_note,
  };
}
