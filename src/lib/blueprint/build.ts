import type { AuditResult, Blueprint, Client, CredentialRef } from '@/lib/types';
import { getTemplate, type AgentTemplate } from './templates';

export interface BlueprintContext {
  client: Client;
  /** The audit that sold the deal, when there was one. */
  audit?: AuditResult | null;
  /** Which SMS/voice provider this client will run on. */
  smsProvider?: 'telnyx' | 'twilio';
}

/**
 * Credential handling, stated once:
 *
 * A blueprint records the NAME of every secret an agent needs, never its
 * value. Values live in exactly one place per deployment - the platform's
 * secret store (Vercel/Supabase env vars for the OS, the n8n credential
 * vault for the delivered workflow). Nothing in this repository reads, writes,
 * logs or persists a credential value, and the `agent_credentials` table has
 * no column that could hold one.
 */
function credentialsFor(template: AgentTemplate, ctx: BlueprintContext): CredentialRef[] {
  const preferred = ctx.smsProvider ?? 'telnyx';
  return template.credentials
    // Keep only the chosen SMS/voice provider, so the checklist is not padded
    // with credentials this client will never configure.
    .filter((c) => (c.provider !== 'telnyx' && c.provider !== 'twilio') || c.provider === preferred)
    .map((c) => ({
      ...c,
      required: c.provider === preferred ? true : c.required,
      scope: `${c.scope} (value lives in the secret store, never in this database)`,
    }));
}

function deploymentChecklist(template: AgentTemplate, ctx: BlueprintContext, creds: CredentialRef[]): string[] {
  const country = ctx.client.country ?? 'the client country';
  const list = [
    `Create an isolated n8n project (or workflow folder) named "${ctx.client.name} - ${template.name}".`,
    ...creds.filter((c) => c.required).map(
      (c) => `Add credential ${c.env_var} (${c.provider}) to the n8n credential store. Do not paste it anywhere else.`,
    ),
    'Import the exported workflow JSON and bind each node to the credentials above.',
    ...template.steps.map((s) => `Run the step test for "${s.title}": ${s.test.how} -> expect: ${s.test.expect}`),
    'Run one full end-to-end pass with your own phone/email as the customer.',
    'Confirm the human handoff fires and reaches the right person.',
    'Confirm quiet hours and the opt-out path both work.',
  ];

  if (template.integrations.some((i) => /sms|voice/i.test(i))) {
    list.push(
      `Provision a local ${country} number and complete the sender registration that country requires before go-live.`,
      'Verify opt-out keywords are handled by the provider AND logged in the CRM.',
    );
  }
  list.push(
    'Record a baseline: what the client believes their current volume and response time are, so month 1 has something to compare against.',
    'Set the agent status to live, and schedule the first review 7 days out.',
  );
  return list;
}

/** Compliance items that apply to any agent messaging EU consumers. */
const EU_GUARDRAILS = [
  'GDPR: record the lawful basis for contacting each person, and keep it queryable.',
  'GDPR: the transcript is personal data - set a retention period and honour deletion requests.',
  'Disclose that the customer is talking to an automated assistant on first contact.',
  'Keep an execution log with inputs and outputs for every run, so any outcome can be explained.',
];

export function buildBlueprint(templateKey: string, ctx: BlueprintContext): Blueprint {
  const template = getTemplate(templateKey);
  if (!template) throw new Error(`unknown template "${templateKey}"`);

  const credentials = credentialsFor(template, ctx);
  const winner = ctx.audit?.opportunities.find((o) => o.id === ctx.audit?.recommended_opportunity_id);

  // Where an audit exists, its workflow is what was sold - fold its extra
  // steps into the template so the build matches the promise.
  const steps = [...template.steps];
  if (winner) {
    for (const [i, ws] of winner.workflow_steps.entries()) {
      const covered = steps.some((s) => s.description.toLowerCase().includes(ws.action.toLowerCase().slice(0, 25))
        || ws.action.toLowerCase().includes(s.description.toLowerCase().slice(0, 25)));
      if (!covered) {
        steps.push({
          key: `audit_${i}`,
          title: ws.action.split('.')[0].slice(0, 70),
          actor: ws.actor,
          description: `${ws.action}${ws.sla ? ` Target: ${ws.sla}.` : ''} (from the audit this client bought)`,
          integration: ws.integration,
          config_keys: [],
          test: {
            how: 'Trigger this path with a test record.',
            expect: ws.sla ? `Completes within ${ws.sla}.` : 'Completes and is visible in the execution log.',
          },
          status: 'todo',
        });
      }
    }
  }

  return {
    template_key: template.key,
    template_name: template.name,
    summary: winner
      ? `${template.name} for ${ctx.client.name}, built to deliver the workflow sold in the audit: ${winner.title}.`
      : `${template.name} for ${ctx.client.name}.`,
    steps,
    credentials,
    integrations: [...new Set([...template.integrations, ...(winner?.integrations ?? [])])],
    human_handoff: template.human_handoff,
    deployment_checklist: deploymentChecklist(template, ctx, credentials),
    guardrails: [...template.guardrails, ...EU_GUARDRAILS],
  };
}

/** What the operator still has to do before this agent can go live. */
export function readiness(blueprint: Blueprint): {
  credentials_missing: string[];
  steps_untested: string[];
  ready: boolean;
} {
  const credentials_missing = blueprint.credentials
    .filter((c) => c.required && c.status === 'missing')
    .map((c) => c.env_var);
  const steps_untested = blueprint.steps.filter((s) => s.status !== 'passed').map((s) => s.title);
  return {
    credentials_missing,
    steps_untested,
    ready: credentials_missing.length === 0 && steps_untested.length === 0,
  };
}
