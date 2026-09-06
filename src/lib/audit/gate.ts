import type { AuditResult, Opportunity, Snapshot } from '@/lib/types';
import { TEMPLATE_KEYS } from '@/lib/blueprint/templates';

/** Words that carry no information about what the workflow actually does.
 *  A title built only from these is a capability claim, not a proposal. */
const GENERIC_TOKENS = new Set([
  'use', 'using', 'leverage', 'implement', 'implementing', 'add', 'adding', 'introduce', 'adopt',
  'a', 'an', 'the', 'for', 'to', 'of', 'and', 'with', 'your', 'their',
  'ai', 'artificial', 'intelligence', 'chatbot', 'chat', 'bot', 'assistant',
  'automation', 'automate', 'automated', 'machine', 'learning', 'llm', 'gpt',
  'digital', 'transformation', 'solution', 'solutions', 'system', 'tool', 'platform',
  'improve', 'improvement', 'optimise', 'optimize', 'efficiency', 'productivity',
  'business', 'process', 'processes', 'workflow', 'strategy',
]);

/** True when nothing in the title names what the thing actually does, once
 *  filler and the company's own name are removed. */
function titleIsContentFree(title: string, companyName: string): boolean {
  const companyTokens = new Set(companyName.toLowerCase().split(/[^a-z0-9]+/i).filter(Boolean));
  const content = title
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .filter((t) => !GENERIC_TOKENS.has(t) && !companyTokens.has(t));
  return content.length === 0;
}

const VAGUE_ACTION =
  /^(use|leverage|utilize|utilise|implement|improve|optimi[sz]e|streamline|enhance|automate)\b(?!.*\b(when|after|within|to the|into|via|by sending|by writing)\b)/i;

export interface GateOutcome {
  ok: boolean;
  problems: string[];
}

function checkOpportunity(
  o: Opportunity, index: number, snapshot: Snapshot, companyName: string,
): string[] {
  const p: string[] = [];
  const where = `opportunity[${index}] "${o.title}"`;

  if (!TEMPLATE_KEYS.includes(o.template_key)) {
    p.push(`${where}: unknown template_key "${o.template_key}"`);
  }
  if (o.workflow_steps.length < 4) {
    p.push(`${where}: only ${o.workflow_steps.length} workflow steps, need at least 4`);
  }
  if (!o.workflow_steps.some((s) => s.actor === 'trigger')) {
    p.push(`${where}: no trigger step - the workflow has no defined entry point`);
  }
  if (!o.workflow_steps.some((s) => s.actor === 'human')) {
    p.push(`${where}: no human step - every agent needs a defined handoff`);
  }
  if (!o.workflow_steps.some((s) => s.channel)) {
    p.push(`${where}: no step names a channel (sms/email/voice/web)`);
  }
  if (!o.workflow_steps.some((s) => s.integration)) {
    p.push(`${where}: no step names an integration`);
  }
  if (titleIsContentFree(o.title, companyName)) {
    p.push(`${where}: title describes a capability, not a workflow`);
  }
  for (const step of o.workflow_steps) {
    if (VAGUE_ACTION.test(step.action.trim())) {
      p.push(`${where}: step "${step.action.slice(0, 60)}" states an intention, not an action`);
    }
  }
  // Do not sell somebody a thing they already have.
  if (o.template_key === 'ai_receptionist' && snapshot.signals.has_online_booking
      && snapshot.signals.booking_vendors.length > 0) {
    p.push(`${where}: proposes online booking, but the site already runs ${snapshot.signals.booking_vendors.join(', ')}`);
  }
  if (o.template_key === 'support_faq' && snapshot.signals.has_live_chat) {
    p.push(`${where}: proposes a support agent, but the site already runs a live chat widget`);
  }
  return p;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').replace(/["'‘’“”]/g, '"').trim();
}

/** Structural quality gate. An audit that fails is stored with status
 *  'rejected' together with its reasons - it is never shown to a prospect. */
export function gateAudit(result: AuditResult, snapshot: Snapshot, companyName = ''): GateOutcome {
  const problems: string[] = [];

  if (result.opportunities.length < 3) {
    problems.push(`only ${result.opportunities.length} opportunities, need 3-5`);
  }

  const problemIds = new Set(result.problems.map((p) => p.id));
  for (const [i, o] of result.opportunities.entries()) {
    problems.push(...checkOpportunity(o, i, snapshot, companyName));
    if (!problemIds.has(o.problem_id)) {
      problems.push(`opportunity[${i}] "${o.title}": problem_id "${o.problem_id}" does not exist`);
    }
  }

  // Every problem must quote text that actually appears on the fetched site.
  const corpus = snapshot.pages.map((p) => normalize(p.text)).join('  ');
  for (const problem of result.problems) {
    for (const e of problem.evidence) {
      const needle = normalize(e.quote);
      const probe = needle.length > 60 ? needle.slice(0, 60) : needle;
      if (probe.length >= 12 && !corpus.includes(probe)) {
        problems.push(
          `problem "${problem.title}": evidence quote not found in the fetched pages - "${e.quote.slice(0, 60)}"`,
        );
      }
    }
  }

  if (!result.opportunities.some((o) => o.id === result.recommended_opportunity_id)) {
    problems.push('recommended_opportunity_id does not match any opportunity');
  }

  return { ok: problems.length === 0, problems };
}
