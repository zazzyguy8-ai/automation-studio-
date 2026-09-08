import { runAudit } from '@/lib/audit/run';
import { buildBlueprint } from '@/lib/blueprint/build';
import { getStore } from '@/lib/db';
import { buildDemo } from '@/lib/demo/build';
import { paybackMonths } from '@/lib/estimate/model';
import { DEFAULT_AUDIT_MODEL, resolveModel } from '@/lib/llm/models';
import { buildOutreachSequence } from '@/lib/outreach/build';
import { fixtureFetcher } from '@/lib/scrape/fixture-fetcher';
import { CrawlError, type Fetcher } from '@/lib/scrape/crawl';
import type {
  Audit, AuditResult, Blueprint, Demo, Estimate, Lead, Opportunity, OutreachMessage, Problem, Snapshot,
} from '@/lib/types';
import { FIXTURES, type PipelineArgs } from './args';

export interface PipelineInput extends PipelineArgs {
  /** Test hook. When absent, --fixture selects the offline fetcher and a bare
   *  URL uses the network. */
  fetcher?: Fetcher;
  source?: string;
}

/** What was actually written to the store, so the caller can report it and a
 *  test can assert it rather than trusting the happy path. */
export interface Persisted {
  lead_id: string;
  snapshot_id: string;
  audit_id: string;
  demo_id: string;
  outreach_ids: string[];
}

export interface PipelineSuccess {
  ok: true;
  lead: Lead;
  snapshot: Snapshot;
  audit: Audit;
  result: AuditResult;
  problem: Problem;
  winner: Opportunity;
  demo: Demo;
  payback: Estimate;
  emails: OutreachMessage[];
  /** Generated, not stored: an agent needs a client, and a prospect who has not
   *  bought must not appear in the client list. It is stored when you win the
   *  deal and create the agent. */
  blueprint: Blueprint;
  persisted: Persisted;
}

export interface PipelineFailure {
  ok: false;
  /** 'crawl' means we never got the page. 'audit' means we read it and could
   *  not build a proposal from it. Keeping them apart matters: the first is
   *  usually fixable, the second is a judgement about the business. */
  stage: 'crawl' | 'audit';
  /** Null on a crawl failure - there is nothing to enrich a lead from. */
  lead: Lead | null;
  audit: Audit | null;
  reasons: string[];
  /** Operator-facing explanation of what to do about it. */
  hint: string;
}

export type PipelineOutcome = PipelineSuccess | PipelineFailure;

export function activeProvider(): { name: string; model: string; problem: string | null } {
  const forced = process.env.REASONING_PROVIDER;
  const name = forced ?? (process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'heuristic');
  if (name !== 'anthropic') return { name, model: 'heuristic', problem: null };
  // Reporting path, so it reports the misconfiguration instead of throwing on
  // it - `status` has to stay readable precisely when the config is wrong.
  const { model, problem } = resolveModel('AUDIT_MODEL', DEFAULT_AUDIT_MODEL);
  return { name, model, problem };
}

function crawlHint(err: CrawlError): string {
  if (err.status === 403 || err.status === 401) {
    return 'The site refused the request (403/401). That is bot protection, a firewall or an '
      + 'outbound proxy - not evidence about the business. Open the URL in a browser to confirm '
      + 'it loads, and try again from a network that is not filtered.';
  }
  if (err.status === 404) {
    return 'That exact URL is a 404. Check for a typo, or try the apex domain.';
  }
  if (err.status === 0) {
    return 'The request never completed - DNS failure, timeout, or the host is down.';
  }
  if (err.status >= 500) {
    return 'The site returned a server error. Try again later; this says nothing about the business.';
  }
  return 'The page could not be read, so there is nothing to audit. Nothing was saved.';
}

function failureHint(audit: Audit, snapshot: Snapshot | null): string {
  if (audit.status === 'error') {
    const pages = snapshot?.pages.length ?? 0;
    const chars = snapshot?.pages.reduce((n, p) => n + p.text.length, 0) ?? 0;
    if (chars < 400) {
      return 'The site returned almost no readable text. It is probably a placeholder, or renders '
        + 'entirely client-side — the crawler reads static HTML. Try a different URL, or check the '
        + 'page source has real content.';
    }
    return `Read ${pages} page(s) but could not ground an automation opportunity in them. `
      + 'With ANTHROPIC_API_KEY set, Claude reads the prose instead of pattern-matching it and '
      + 'usually finds something here.';
  }
  return 'The audit was produced but rejected by the quality gate, so it is not fit to show a '
    + 'prospect. The reasons above say exactly what failed.';
}

/**
 * URL in, complete proposal out.
 *
 * Crawl -> enrich the CRM record -> audit -> quality gate -> demo with labelled
 * estimates -> grounded outreach drafts -> implementation blueprint. Everything
 * except the blueprint is persisted as it is produced, so a run that dies
 * halfway still leaves the work it finished.
 *
 * This is the same code the web UI drives; the CLI only renders the result.
 */
export async function runPipeline(input: PipelineInput): Promise<PipelineOutcome> {
  const fetcher = input.fetcher
    ?? (input.fixture ? fixtureFetcher(input.fixture, FIXTURES[input.fixture].url) : undefined);

  let audited;
  try {
    audited = await runAudit({
      website: input.website,
      industry: input.industry,
      country: input.country,
      source: input.source ?? 'cli',
      fetcher,
    });
  } catch (err) {
    if (err instanceof CrawlError) {
      return {
        ok: false,
        stage: 'crawl',
        lead: null,
        audit: null,
        reasons: [err.message],
        hint: crawlHint(err),
      };
    }
    throw err;
  }
  const { lead, snapshot, audit } = audited;

  if (audit.status !== 'ok' || !audit.result) {
    return {
      ok: false,
      stage: 'audit',
      lead,
      audit,
      reasons: audit.gate_report.length > 0
        ? audit.gate_report
        : [audit.error ?? 'unknown failure'],
      hint: failureHint(audit, snapshot),
    };
  }

  const result = audit.result;
  const winner = result.opportunities.find((o) => o.id === result.recommended_opportunity_id);
  if (!winner) {
    // The gate already checks this; belt and braces so the type narrows safely.
    throw new Error('audit passed the gate but its recommendation does not resolve');
  }
  const problem = result.problems.find((p) => p.id === winner.problem_id);
  if (!problem) throw new Error(`recommended opportunity references missing problem "${winner.problem_id}"`);

  const demo = await buildDemo(lead, audit);
  const payback = paybackMonths(demo.impact, input.buildFee, input.monthlyFee);
  const emails = await buildOutreachSequence(lead, audit, demo, 'email', input.emailSteps);

  const blueprint = buildBlueprint(winner.template_key, {
    client: {
      id: 'preview',
      lead_id: lead.id,
      name: lead.company_name,
      country: lead.country,
      build_fee_eur: input.buildFee,
      monthly_fee_eur: input.monthlyFee,
      stripe_customer_id: null,
      created_at: new Date().toISOString(),
    },
    audit: result,
  });

  return {
    ok: true,
    lead,
    snapshot,
    audit,
    result,
    problem,
    winner,
    demo,
    payback,
    emails,
    blueprint,
    persisted: {
      lead_id: lead.id,
      snapshot_id: snapshot.id,
      audit_id: audit.id,
      demo_id: demo.id,
      outreach_ids: emails.map((e) => e.id),
    },
  };
}

/** Reads every persisted id back out of the store. Used by the CLI to report
 *  what was saved, and by the tests to prove it actually landed. */
export async function verifyPersisted(p: Persisted): Promise<{ ok: boolean; missing: string[] }> {
  const store = await getStore();
  const missing: string[] = [];

  if (!(await store.getLead(p.lead_id))) missing.push(`lead ${p.lead_id}`);
  if (!(await store.getAudit(p.audit_id))) missing.push(`audit ${p.audit_id}`);

  const snapshot = await store.latestSnapshot(p.lead_id);
  if (!snapshot || snapshot.id !== p.snapshot_id) missing.push(`snapshot ${p.snapshot_id}`);

  const demo = await store.latestDemo(p.lead_id);
  if (!demo || demo.id !== p.demo_id) missing.push(`demo ${p.demo_id}`);

  const outreach = await store.listOutreach(p.lead_id);
  for (const id of p.outreach_ids) {
    if (!outreach.some((m) => m.id === id)) missing.push(`outreach ${id}`);
  }

  return { ok: missing.length === 0, missing };
}
