import type { Blueprint, BlueprintStep } from '@/lib/types';

/**
 * Emits an importable n8n workflow skeleton from a blueprint.
 *
 * This is the deliberate division of labour in this architecture: the OS
 * reasons and produces the plan, n8n runs the client's agent. The export is a
 * scaffold - every node is placed, named, connected and annotated with its
 * test, so the remaining work is filling in parameters rather than assembling
 * a workflow from an empty canvas.
 *
 * No credential value is ever written into the export. Nodes carry the
 * credential NAME, which n8n resolves against its own vault on import.
 */

interface N8nNode {
  parameters: Record<string, unknown>;
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  credentials?: Record<string, { id: string; name: string }>;
  notes?: string;
}

export interface N8nWorkflow {
  name: string;
  nodes: N8nNode[];
  connections: Record<string, { main: Array<Array<{ node: string; type: 'main'; index: number }>> }>;
  settings: Record<string, unknown>;
  meta: Record<string, unknown>;
}

const X_STEP = 260;
const Y_MAIN = 300;

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
}

function nodeIdFor(workflowKey: string, stepKey: string): string {
  // Stable ids: re-exporting the same blueprint produces the same file, so a
  // diff shows what actually changed.
  return `${workflowKey}-${stepKey}`.slice(0, 64);
}

function nodeSpec(step: BlueprintStep): { type: string; typeVersion: number; parameters: Record<string, unknown> } {
  const integration = (step.integration ?? '').toLowerCase();

  if (step.actor === 'trigger') {
    if (/voice|call/.test(integration)) {
      return {
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        parameters: { httpMethod: 'POST', path: slug(step.key), options: {} },
      };
    }
    if (/email|inbox/.test(integration)) {
      return { type: 'n8n-nodes-base.emailReadImap', typeVersion: 2, parameters: { options: {} } };
    }
    return {
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      parameters: { httpMethod: 'POST', path: slug(step.key), options: {} },
    };
  }

  if (step.actor === 'ai') {
    return {
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      parameters: {
        method: 'POST',
        url: 'https://api.anthropic.com/v1/messages',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'anthropic-version', value: '2023-06-01' },
            // Referenced by name; n8n injects the value from its credential store.
            { name: 'x-api-key', value: '={{ $credentials.anthropicApi.apiKey }}' },
          ],
        },
        sendBody: true,
        specifyBody: 'json',
        jsonBody:
          '={{ JSON.stringify({ model: "claude-sonnet-5", max_tokens: 1024, system: $json.systemPrompt, messages: [{ role: "user", content: $json.userMessage }] }) }}',
        options: {},
      },
    };
  }

  if (step.actor === 'human') {
    return {
      type: 'n8n-nodes-base.emailSend',
      typeVersion: 2.1,
      parameters: {
        subject: `=Handoff: {{ $json.company || "agent" }}`,
        options: {},
      },
    };
  }

  if (/sms/.test(integration)) {
    return {
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      parameters: {
        method: 'POST',
        url: 'https://api.telnyx.com/v2/messages',
        sendBody: true,
        specifyBody: 'json',
        jsonBody:
          '={{ JSON.stringify({ from: $env.TELNYX_FROM_NUMBER, to: $json.phone, text: $json.message }) }}',
        options: {},
      },
    };
  }

  if (/calendar/.test(integration)) {
    return { type: 'n8n-nodes-base.googleCalendar', typeVersion: 1.3, parameters: { options: {} } };
  }

  if (/crm/.test(integration)) {
    return {
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      parameters: { method: 'POST', url: '={{ $env.CRM_BASE_URL }}/contacts', sendBody: true, options: {} },
    };
  }

  if (/email/.test(integration)) {
    return { type: 'n8n-nodes-base.emailSend', typeVersion: 2.1, parameters: { options: {} } };
  }

  return { type: 'n8n-nodes-base.noOp', typeVersion: 1, parameters: {} };
}

export function toN8nWorkflow(blueprint: Blueprint, clientName: string): N8nWorkflow {
  const workflowName = `${clientName} - ${blueprint.template_name}`;
  const key = slug(workflowName);

  const nodes: N8nNode[] = blueprint.steps.map((step, i) => {
    const spec = nodeSpec(step);
    return {
      ...spec,
      id: nodeIdFor(key, step.key),
      name: step.title,
      position: [200 + i * X_STEP, Y_MAIN],
      notes: `${step.description}\n\nTEST: ${step.test.how}\nEXPECT: ${step.test.expect}`
        + (step.config_keys.length ? `\nCONFIG: ${step.config_keys.join(', ')}` : ''),
    };
  });

  // One sticky note carrying the credential and guardrail contract, so the
  // person opening the workflow in n8n sees the rules without leaving the tab.
  nodes.push({
    id: `${key}-notes`,
    name: 'Setup notes',
    type: 'n8n-nodes-base.stickyNote',
    typeVersion: 1,
    position: [200, Y_MAIN - 260],
    parameters: {
      width: Math.max(420, blueprint.steps.length * X_STEP),
      height: 240,
      content: [
        `## ${workflowName}`,
        '',
        '**Credentials to create in the n8n credential store (names only - never paste values into node fields):**',
        ...blueprint.credentials.filter((c) => c.required).map((c) => `- \`${c.env_var}\` (${c.provider}) - ${c.scope}`),
        '',
        '**Guardrails this workflow must not break:**',
        ...blueprint.guardrails.map((g) => `- ${g}`),
        '',
        `**Human handoff:** ${blueprint.human_handoff.route_to} - ${blueprint.human_handoff.sla}`,
      ].join('\n'),
    },
  });

  const connections: N8nWorkflow['connections'] = {};
  for (let i = 0; i < blueprint.steps.length - 1; i += 1) {
    connections[nodes[i].name] = {
      main: [[{ node: nodes[i + 1].name, type: 'main', index: 0 }]],
    };
  }

  return {
    name: workflowName,
    nodes,
    connections,
    settings: { executionOrder: 'v1', saveManualExecutions: true, saveDataErrorExecution: 'all' },
    meta: {
      generatedBy: 'automation-studio',
      templateKey: blueprint.template_key,
      note: 'Scaffold. Bind credentials and fill node parameters before enabling.',
    },
  };
}
