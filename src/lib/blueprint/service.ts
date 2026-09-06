import { getStore } from '@/lib/db';
import type { Agent, Client } from '@/lib/types';
import { buildBlueprint, readiness } from './build';

export interface ConvertLeadInput {
  lead_id: string;
  build_fee_eur?: number | null;
  monthly_fee_eur?: number | null;
}

/** Won lead -> client. The audit stays linked, so the build can be checked
 *  against what was actually sold. */
export async function convertLeadToClient(input: ConvertLeadInput): Promise<Client> {
  const store = await getStore();
  const lead = await store.getLead(input.lead_id);
  if (!lead) throw new Error(`lead ${input.lead_id} not found`);

  const client = await store.insertClient({
    lead_id: lead.id,
    name: lead.company_name,
    country: lead.country,
    build_fee_eur: input.build_fee_eur ?? null,
    monthly_fee_eur: input.monthly_fee_eur ?? null,
    // Populated when Stripe is switched on; the schema is ready for it.
    stripe_customer_id: null,
  });
  await store.setLeadStage(lead.id, 'won');
  return client;
}

export interface CreateAgentInput {
  client_id: string;
  template_key: string;
  name?: string;
  sms_provider?: 'telnyx' | 'twilio';
}

/** Client + template -> a fully specified agent: steps, integrations,
 *  credential references, per-step tests and a deployment checklist. */
export async function createAgent(input: CreateAgentInput): Promise<Agent> {
  const store = await getStore();
  const client = await store.getClient(input.client_id);
  if (!client) throw new Error(`client ${input.client_id} not found`);

  const audit = client.lead_id ? await store.latestAudit(client.lead_id) : null;
  const blueprint = buildBlueprint(input.template_key, {
    client,
    audit: audit?.result ?? null,
    smsProvider: input.sms_provider ?? 'telnyx',
  });

  return store.insertAgent({
    client_id: client.id,
    name: input.name ?? `${client.name} - ${blueprint.template_name}`,
    template_key: input.template_key,
    status: 'draft',
    blueprint,
  });
}

/** Record the outcome of testing one build step. Going live is gated on these. */
export async function recordStepTest(
  agentId: string, stepKey: string, passed: boolean,
): Promise<Agent> {
  const store = await getStore();
  const agent = await store.getAgent(agentId);
  if (!agent) throw new Error(`agent ${agentId} not found`);

  const blueprint = {
    ...agent.blueprint,
    steps: agent.blueprint.steps.map(
      (s) => (s.key === stepKey ? { ...s, status: passed ? ('passed' as const) : ('failed' as const) } : s),
    ),
  };
  const status = agent.status === 'draft' ? 'testing' : agent.status;
  return store.updateAgent(agentId, { blueprint, status });
}

/** Mark a credential as configured or verified. The value is never sent here -
 *  this only records that the operator has put it in the secret store. */
export async function setCredentialStatus(
  agentId: string, envVar: string, status: 'missing' | 'configured' | 'verified',
): Promise<Agent> {
  const store = await getStore();
  const agent = await store.getAgent(agentId);
  if (!agent) throw new Error(`agent ${agentId} not found`);

  const blueprint = {
    ...agent.blueprint,
    credentials: agent.blueprint.credentials.map((c) => (c.env_var === envVar ? { ...c, status } : c)),
  };
  return store.updateAgent(agentId, { blueprint });
}

/** Go-live is refused until every required credential is in place and every
 *  step has a passing test. */
export async function goLive(agentId: string): Promise<Agent> {
  const store = await getStore();
  const agent = await store.getAgent(agentId);
  if (!agent) throw new Error(`agent ${agentId} not found`);

  const check = readiness(agent.blueprint);
  if (!check.ready) {
    throw new Error(
      `not ready: ${check.credentials_missing.length} credential(s) missing `
      + `(${check.credentials_missing.join(', ') || 'none'}), `
      + `${check.steps_untested.length} step(s) untested (${check.steps_untested.join(', ') || 'none'})`,
    );
  }
  return store.updateAgent(agentId, { status: 'live' });
}
