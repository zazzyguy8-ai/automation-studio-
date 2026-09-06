import Anthropic from '@anthropic-ai/sdk';
import { AuditResultSchema, type AuditResult, type Lead } from '@/lib/types';
import { AUDIT_SYSTEM, COPY_SYSTEM, auditUserPrompt, siteDigest } from './prompts';
import type { AuditInput, CopyInput, CopyOutput, ReasoningProvider } from './provider';

/** JSON Schema mirrors of the zod contracts. Claude is forced through a tool
 *  call so the response is structurally valid before zod ever sees it. */
const workflowStep = {
  type: 'object',
  required: ['actor', 'action', 'channel', 'integration', 'sla'],
  properties: {
    actor: { type: 'string', enum: ['trigger', 'system', 'ai', 'human'] },
    action: { type: 'string', description: 'Concrete action, e.g. "send SMS quoting the requested service"' },
    channel: { type: ['string', 'null'], description: 'sms, email, voice, web, whatsapp or null' },
    integration: { type: ['string', 'null'] },
    sla: { type: ['string', 'null'], description: 'e.g. "< 60s"' },
  },
} as const;

const AUDIT_TOOL: Anthropic.Tool = {
  name: 'submit_audit',
  description: 'Submit the completed business audit.',
  input_schema: {
    type: 'object',
    required: ['business_profile', 'problems', 'opportunities', 'recommended_opportunity_id', 'recommendation_rationale'],
    properties: {
      business_profile: {
        type: 'object',
        required: ['what_they_do', 'services', 'customer_type', 'booking_model', 'intake_channels', 'team_size_hint', 'locations'],
        properties: {
          what_they_do: { type: 'string' },
          services: { type: 'array', items: { type: 'string' } },
          customer_type: { type: 'string', enum: ['b2c', 'b2b', 'both'] },
          booking_model: { type: 'string' },
          intake_channels: { type: 'array', items: { type: 'string' } },
          team_size_hint: { type: ['string', 'null'] },
          locations: { type: 'array', items: { type: 'string' } },
        },
      },
      problems: {
        type: 'array', minItems: 1, maxItems: 6,
        items: {
          type: 'object',
          required: ['id', 'title', 'description', 'category', 'revenue_leak_hypothesis', 'evidence'],
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            category: {
              type: 'string',
              enum: ['lead_response', 'lead_capture', 'booking', 'follow_up', 'quoting', 'reputation', 'support', 'internal_admin'],
            },
            revenue_leak_hypothesis: { type: 'string' },
            evidence: {
              type: 'array', minItems: 1,
              items: {
                type: 'object', required: ['quote', 'url'],
                properties: { quote: { type: 'string' }, url: { type: 'string' } },
              },
            },
          },
        },
      },
      opportunities: {
        type: 'array', minItems: 3, maxItems: 5,
        items: {
          type: 'object',
          required: ['id', 'title', 'problem_id', 'template_key', 'workflow_steps', 'integrations', 'roi', 'effort', 'urgency'],
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            problem_id: { type: 'string' },
            template_key: { type: 'string' },
            workflow_steps: { type: 'array', minItems: 4, items: workflowStep },
            integrations: { type: 'array', minItems: 1, items: { type: 'string' } },
            roi: {
              type: 'object', required: ['score', 'rationale', 'driver_metric'],
              properties: {
                score: { type: 'number' }, rationale: { type: 'string' },
                driver_metric: { type: 'string', description: 'The single metric this moves' },
              },
            },
            effort: {
              type: 'object', required: ['score', 'rationale', 'build_days'],
              properties: { score: { type: 'number' }, rationale: { type: 'string' }, build_days: { type: 'number' } },
            },
            urgency: {
              type: 'object', required: ['score', 'rationale', 'why_now'],
              properties: { score: { type: 'number' }, rationale: { type: 'string' }, why_now: { type: 'string' } },
            },
          },
        },
      },
      recommended_opportunity_id: { type: 'string' },
      recommendation_rationale: { type: 'string' },
    },
  },
};

const COPY_TOOL: Anthropic.Tool = {
  name: 'submit_message',
  description: 'Submit the outreach message.',
  input_schema: {
    type: 'object',
    required: ['subject', 'body', 'grounding'],
    properties: {
      subject: { type: ['string', 'null'] },
      body: { type: 'string' },
      grounding: { type: 'array', minItems: 1, items: { type: 'string' } },
    },
  },
};

const DEMO_TOOL: Anthropic.Tool = {
  name: 'submit_demo_script',
  description: 'Submit the personalised demo script.',
  input_schema: {
    type: 'object',
    required: ['headline', 'before', 'after', 'scenes'],
    properties: {
      headline: { type: 'string' },
      before: { type: 'array', minItems: 3, items: { type: 'string' } },
      after: { type: 'array', minItems: 3, items: { type: 'string' } },
      scenes: {
        type: 'array', minItems: 4, maxItems: 7,
        items: {
          type: 'object', required: ['t', 'on_screen', 'narration'],
          properties: {
            t: { type: 'string', description: 'timestamp, e.g. "0:00-0:15"' },
            on_screen: { type: 'string' },
            narration: { type: 'string' },
          },
        },
      },
    },
  },
};

function toolResult<T>(message: Anthropic.Message, toolName: string): T {
  const block = message.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === toolName,
  );
  if (!block) throw new Error(`model did not call ${toolName} (stop_reason=${message.stop_reason})`);
  return block.input as T;
}

export class AnthropicProvider implements ReasoningProvider {
  readonly name = 'anthropic';
  private client: Anthropic;
  private auditModel: string;
  private copyModel: string;

  constructor(apiKey = process.env.ANTHROPIC_API_KEY) {
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
    this.client = new Anthropic({ apiKey });
    this.auditModel = process.env.AUDIT_MODEL ?? 'claude-opus-5';
    this.copyModel = process.env.COPY_MODEL ?? 'claude-sonnet-5';
  }

  async analyzeBusiness({ lead, snapshot }: AuditInput): Promise<AuditResult> {
    const message = await this.client.messages.create({
      model: this.auditModel,
      max_tokens: 8000,
      system: AUDIT_SYSTEM,
      tools: [AUDIT_TOOL],
      tool_choice: { type: 'tool', name: 'submit_audit' },
      messages: [{
        role: 'user',
        content: auditUserPrompt(lead.company_name, lead.website, lead.industry, lead.country, siteDigest(snapshot)),
      }],
    });
    return AuditResultSchema.parse(toolResult<AuditResult>(message, 'submit_audit'));
  }

  async writeOutreach({ lead, audit, demo, channel, step, sender }: CopyInput): Promise<CopyOutput> {
    const winner = audit.opportunities.find((o) => o.id === audit.recommended_opportunity_id);
    const problem = audit.problems.find((p) => p.id === winner?.problem_id);
    const stepBrief = step === 0
      ? 'This is the FIRST touch. Lead with the specific observation, not with your service.'
      : `This is follow-up #${step}. Do not repeat the first message. Add one new angle and get shorter.`;

    const message = await this.client.messages.create({
      model: this.copyModel,
      max_tokens: 1500,
      system: COPY_SYSTEM,
      tools: [COPY_TOOL],
      tool_choice: { type: 'tool', name: 'submit_message' },
      messages: [{
        role: 'user',
        content: `Channel: ${channel}. ${stepBrief}

Recipient business: ${lead.company_name} (${lead.website})
What they do: ${audit.business_profile.what_they_do}

The problem I found:
${problem?.title} — ${problem?.description}
Evidence I can quote to them: ${problem?.evidence.map((e) => `"${e.quote}" (${e.url})`).join(' | ')}

What I would build: ${winner?.title}
The workflow: ${winner?.workflow_steps.map((s) => s.action).join(' -> ')}

Impact framing available (ALL are estimates, label them as such):
${demo.impact.map((i) => `${i.label}: ${i.low}-${i.high} ${i.unit} (${i.confidence})`).join('\n')}

Sender: ${sender.name}, ${sender.company}. Booking link: ${sender.calendar_url}`,
      }],
    });
    return toolResult<CopyOutput>(message, 'submit_message');
  }

  async writeDemoScript({ lead, audit }: { lead: Lead; audit: AuditResult }) {
    const winner = audit.opportunities.find((o) => o.id === audit.recommended_opportunity_id);
    const message = await this.client.messages.create({
      model: this.copyModel,
      max_tokens: 2500,
      system: `You script 60-120 second screen-recorded demos for a one-person AI automation agency.
The viewer is the business owner. The demo shows THEIR workflow, using THEIR service names and THEIR wording.
Never state a number as a measurement of their business. Estimates must be spoken as estimates.
Scenes are what is on screen plus exactly what to say. Total runtime 60-120 seconds.`,
      tools: [DEMO_TOOL],
      tool_choice: { type: 'tool', name: 'submit_demo_script' },
      messages: [{
        role: 'user',
        content: `Business: ${lead.company_name} — ${audit.business_profile.what_they_do}
Services: ${audit.business_profile.services.join(', ')}
Current intake: ${audit.business_profile.intake_channels.join(', ')}
Booking model: ${audit.business_profile.booking_model}

Automation to demo: ${winner?.title}
Steps: ${winner?.workflow_steps.map((s) => `[${s.actor}] ${s.action}${s.sla ? ` (${s.sla})` : ''}`).join('\n')}

Write the before state, the after state, and the scene-by-scene script.`,
      }],
    });
    return toolResult<{
      headline: string; before: string[]; after: string[];
      scenes: Array<{ t: string; on_screen: string; narration: string }>;
    }>(message, 'submit_demo_script');
  }
}

