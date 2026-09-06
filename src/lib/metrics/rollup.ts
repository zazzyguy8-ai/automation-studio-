import { getStore } from '@/lib/db';
import type { Agent, Estimate, Execution } from '@/lib/types';

export interface AgentMetrics {
  agent_id: string;
  agent_name: string;
  template_key: string;
  status: Agent['status'];
  executions: number;
  leads_handled: number;
  appointments_booked: number;
  follow_ups_sent: number;
  human_handoffs: number;
  errors: number;
  error_rate: number;
  /** Estimates, because minutes-per-execution is a configured assumption. */
  time_saved: Estimate;
  revenue_influenced: Estimate;
}

export interface ClientMetrics {
  client_id: string;
  client_name: string;
  monthly_fee_eur: number | null;
  agents: AgentMetrics[];
  totals: {
    active_agents: number;
    executions: number;
    leads_handled: number;
    appointments_booked: number;
    follow_ups_sent: number;
    human_handoffs: number;
    errors: number;
  };
  time_saved: Estimate;
  revenue_influenced: Estimate;
  /** Estimated value against the fee actually charged. */
  roi: Estimate | null;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function estimateFrom(
  label: string, unit: string, total: number, assumptions: string[],
): Estimate {
  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    label,
    unit,
    low: round(total * 0.6),
    base: round(total),
    high: round(total * 1.4),
    confidence: 'assumed',
    assumptions: [
      'Estimate. Execution counts are measured; the value per execution is a configured assumption.',
      ...assumptions,
    ],
    is_estimate: true,
  };
}

export function rollupAgent(agent: Agent, executions: Execution[]): AgentMetrics {
  const errors = executions.filter((e) => e.status === 'error').length;
  return {
    agent_id: agent.id,
    agent_name: agent.name,
    template_key: agent.template_key,
    status: agent.status,
    executions: executions.length,
    leads_handled: executions.filter((e) => e.outcome.lead_handled).length,
    appointments_booked: executions.filter((e) => e.outcome.appointment_booked).length,
    follow_ups_sent: executions.filter((e) => e.outcome.follow_up_sent).length,
    human_handoffs: executions.filter((e) => e.outcome.human_handoff).length,
    errors,
    error_rate: executions.length ? Number((errors / executions.length).toFixed(3)) : 0,
    time_saved: estimateFrom(
      'Time saved', 'hours',
      sum(executions.map((e) => e.minutes_saved)) / 60,
      [`Based on ${executions.length} recorded execution(s) and the minutes-saved value configured per execution.`],
    ),
    revenue_influenced: estimateFrom(
      'Revenue influenced', 'EUR',
      sum(executions.map((e) => e.revenue_influenced_eur)),
      ['Influenced, not attributed - the agent handled the contact, it did not close the sale.'],
    ),
  };
}

export async function rollupClient(clientId: string): Promise<ClientMetrics> {
  const store = await getStore();
  const client = await store.getClient(clientId);
  if (!client) throw new Error(`client ${clientId} not found`);

  const agents = await store.listAgents(clientId);
  const perAgent: AgentMetrics[] = [];
  for (const agent of agents) {
    perAgent.push(rollupAgent(agent, await store.listExecutions(agent.id, 5000)));
  }

  const totals = {
    active_agents: agents.filter((a) => a.status === 'live').length,
    executions: sum(perAgent.map((a) => a.executions)),
    leads_handled: sum(perAgent.map((a) => a.leads_handled)),
    appointments_booked: sum(perAgent.map((a) => a.appointments_booked)),
    follow_ups_sent: sum(perAgent.map((a) => a.follow_ups_sent)),
    human_handoffs: sum(perAgent.map((a) => a.human_handoffs)),
    errors: sum(perAgent.map((a) => a.errors)),
  };

  const hours = sum(perAgent.map((a) => a.time_saved.base));
  const revenue = sum(perAgent.map((a) => a.revenue_influenced.base));
  const hourlyCost = Number(process.env.CLIENT_HOURLY_COST_EUR ?? 22);
  const value = revenue + hours * hourlyCost;

  const time_saved = estimateFrom('Time saved', 'hours', hours,
    [`Across ${agents.length} agent(s).`]);
  const revenue_influenced = estimateFrom('Revenue influenced', 'EUR', revenue,
    ['Influenced, not attributed.']);

  const roi: Estimate | null = client.monthly_fee_eur
    ? {
        label: 'Estimated value returned per EUR of monthly fee',
        unit: 'x',
        low: Number((value * 0.6 / client.monthly_fee_eur).toFixed(2)),
        base: Number((value / client.monthly_fee_eur).toFixed(2)),
        high: Number((value * 1.4 / client.monthly_fee_eur).toFixed(2)),
        confidence: 'assumed',
        assumptions: [
          'Estimate. Combines measured execution counts with assumed per-execution value.',
          `Values staff time at EUR ${hourlyCost}/hour (CLIENT_HOURLY_COST_EUR).`,
          `Against the EUR ${client.monthly_fee_eur}/month management fee.`,
          'Does not include the one-off build fee.',
        ],
        is_estimate: true,
      }
    : null;

  return {
    client_id: client.id,
    client_name: client.name,
    monthly_fee_eur: client.monthly_fee_eur,
    agents: perAgent,
    totals,
    time_saved,
    revenue_influenced,
    roi,
  };
}
