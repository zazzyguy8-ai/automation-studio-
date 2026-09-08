import Anthropic from '@anthropic-ai/sdk';
import { ZodError } from 'zod';
import { AuditResultSchema, type AuditResult, type Lead } from '@/lib/types';
import { AUDIT_SYSTEM, COPY_SYSTEM, auditUserPrompt, siteDigest } from './prompts';
import { DEFAULT_AUDIT_MODEL, DEFAULT_COPY_MODEL, capabilities, requireModel } from './models';
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

/**
 * Output budgets, sized against what each tool is actually asked to produce.
 *
 * The audit is the expensive one and was the source of a real bug: at 8000 it
 * sat right on the edge. The schema demands 3-5 opportunities, each with at
 * least four workflow steps and three scored dimensions, plus up to six
 * problems carrying verbatim evidence quotes. A content-heavy site pushed that
 * past the ceiling, generation stopped mid-tool-input, and what came back was
 * a tool_use block with an empty `input`.
 */
const MAX_TOKENS = {
  /**
   * Has to cover thinking AND the audit, because they share this budget.
   *
   * A full audit for a content-heavy site measures around 8-10k tokens on its
   * own. Adaptive thinking on a hard analysis task can consume as much again
   * before a single character of tool input is written. 16000 left too little
   * margin: the thinking finished, the tool input started, and generation ran
   * out partway through - which the API returns as a tool_use block whose
   * input is incomplete.
   *
   * A budget this size forces streaming: the SDK refuses a non-streaming call
   * that could exceed its ten-minute ceiling ("Streaming is required for
   * operations that may take longer than 10 minutes"). The audit is therefore
   * the one call here that streams. Copy and demo are small enough to stay on
   * the plain request.
   */
  audit: 32000,
  /** One short message. */
  copy: 1500,
  /** A 60-120 second script. */
  demo: 2500,
} as const;

/**
 * Thinking and effort, stated explicitly rather than left to the default.
 *
 * This is the fix for a defect that had no visible cause: the request set
 * neither, and the meaning of "neither" changed underneath the code. On Opus
 * 4.7/4.8 omitting `thinking` meant no thinking at all. On Opus 5 - the model
 * this project actually runs - omitting it runs adaptive thinking, and those
 * tokens come out of the same max_tokens budget as the answer. The request
 * looked unchanged while quietly acquiring a second, unbounded consumer of
 * its output budget.
 *
 * Note what is deliberately NOT done here: thinking is not disabled to
 * reclaim the budget. With thinking off, Opus 5 sometimes writes a tool call
 * into its visible text instead of emitting a tool_use block - the turn
 * succeeds, the call never runs, and nothing raises. That is the same
 * "no complete tool input" symptom, arrived at from the other direction.
 * Headroom is the fix; switching thinking off is not.
 */
function reasoningParams(model: string, effort: 'medium' | 'high') {
  if (!capabilities(model).adaptiveThinking) return {};
  // The installed SDK (0.65.0) predates both parameters - its ThinkingConfig
  // knows only enabled/disabled and it has no output_config at all - so the
  // local types cannot express a request the API accepts. The SDK serializes
  // whatever params object it is handed, so these still reach the wire; the
  // wiring test asserts that rather than trusting it. Upgrading the SDK is the
  // proper fix and is a change of its own, not a rider on this one.
  return {
    thinking: { type: 'adaptive' },
    output_config: { effort },
  } as unknown as Record<string, unknown>;
}

/**
 * Pulls the arguments out of a forced tool call, refusing anything that is not
 * a complete set.
 *
 * The checks here exist because of how this failed in practice. A response cut
 * off by `max_tokens` still contains a tool_use block - the block is just
 * empty or half-written. Returning it unchecked handed zod an empty object,
 * which reported every required field as missing. That error described the
 * symptom (no business_profile, no problems, no opportunities...) and hid the
 * cause, which was only ever that the output budget was too small.
 */
function toolResult<T>(message: Anthropic.Message, toolName: string): T {
  if (message.stop_reason === 'max_tokens') {
    throw new Error(
      `${toolName} was cut off: generation hit max_tokens after ${message.usage.output_tokens} `
      + 'output tokens, before the tool input was complete. This is an output budget problem, '
      + 'not a model or schema problem - raise max_tokens for this call.',
    );
  }

  // Claude may decline; the response is a 200 with no tool call, so it has to
  // be read from stop_reason rather than caught as an error.
  if (message.stop_reason === 'refusal') {
    const details = (message as { stop_details?: { category?: string | null } }).stop_details;
    const category = details?.category ?? null;
    throw new Error(
      `${toolName} was refused by the model${category ? ` (${category})` : ''}. `
      + 'Nothing was produced; the audit cannot be built from this response.',
    );
  }

  const block = message.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === toolName,
  );
  if (!block) throw new Error(`model did not call ${toolName} (stop_reason=${message.stop_reason})`);

  const input = block.input;
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error(`${toolName} returned ${Array.isArray(input) ? 'an array' : typeof input}, not an object.`);
  }
  if (Object.keys(input).length === 0) {
    throw new Error(
      `${toolName} was called with no arguments (stop_reason=${message.stop_reason}, `
      + `${message.usage.output_tokens} output tokens). The tool call is empty, so there is `
      + 'nothing to validate.',
    );
  }

  return input as T;
}

/**
 * Validates tool arguments against the zod contract, reporting failures by
 * field path rather than as a raw ZodError dump.
 *
 * A caller reading "business_profile: Required" needs to know whether the
 * model returned the wrong shape or returned nothing at all - the two have
 * completely different fixes, and the raw error distinguishes them only if you
 * already know what to look for.
 */
function parseToolResult<T>(schema: { parse: (v: unknown) => T }, value: unknown, toolName: string): T {
  try {
    return schema.parse(value);
  } catch (err) {
    if (!(err instanceof ZodError)) throw err;
    const present = value && typeof value === 'object' ? Object.keys(value as object) : [];
    const faults = err.issues
      .slice(0, 8)
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    const more = err.issues.length > 8 ? `\n  ... and ${err.issues.length - 8} more` : '';
    throw new Error(
      `${toolName} returned arguments that do not satisfy the contract.\n`
      + `Top-level keys received: ${present.length ? present.join(', ') : '(none)'}\n`
      + `${faults}${more}`,
    );
  }
}

export interface AnthropicProviderOptions {
  apiKey?: string;
  /** Injectable transport, so the request/response wiring can be tested
   *  without a key and without a network call. */
  fetch?: typeof fetch;
}

export class AnthropicProvider implements ReasoningProvider {
  readonly name = 'anthropic';
  private client: Anthropic;
  private auditModel: string;
  private copyModel: string;

  constructor(options: AnthropicProviderOptions | string = {}) {
    const opts = typeof options === 'string' ? { apiKey: options } : options;
    const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
    this.client = new Anthropic({ apiKey, ...(opts.fetch ? { fetch: opts.fetch } : {}) });
    // Resolved in the constructor, not per request: a bad AUDIT_MODEL should
    // fail here rather than as a 404 partway through a live audit.
    this.auditModel = requireModel('AUDIT_MODEL', DEFAULT_AUDIT_MODEL);
    this.copyModel = requireModel('COPY_MODEL', DEFAULT_COPY_MODEL);
  }

  async analyzeBusiness({ lead, snapshot }: AuditInput): Promise<AuditResult> {
    // Streamed, then collapsed back to a single message: nothing here consumes
    // partial output, so the stream exists only to satisfy the SDK's long
    // request rule. finalMessage() reassembles the tool input from the deltas.
    const message = await this.client.messages.stream({
      model: this.auditModel,
      max_tokens: MAX_TOKENS.audit,
      ...reasoningParams(this.auditModel, 'high'),
      system: AUDIT_SYSTEM,
      tools: [AUDIT_TOOL],
      tool_choice: { type: 'tool', name: 'submit_audit' },
      messages: [{
        role: 'user',
        content: auditUserPrompt(lead.company_name, lead.website, lead.industry, lead.country, siteDigest(snapshot)),
      }],
    }).finalMessage();
    return parseToolResult(AuditResultSchema, toolResult(message, 'submit_audit'), 'submit_audit');
  }

  async writeOutreach({ lead, audit, demo, channel, step, sender }: CopyInput): Promise<CopyOutput> {
    const winner = audit.opportunities.find((o) => o.id === audit.recommended_opportunity_id);
    const problem = audit.problems.find((p) => p.id === winner?.problem_id);
    const stepBrief = step === 0
      ? 'This is the FIRST touch. Lead with the specific observation, not with your service.'
      : `This is follow-up #${step}. Do not repeat the first message. Add one new angle and get shorter.`;

    const message = await this.client.messages.create({
      model: this.copyModel,
      max_tokens: MAX_TOKENS.copy,
      ...reasoningParams(this.copyModel, 'medium'),
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
      max_tokens: MAX_TOKENS.demo,
      ...reasoningParams(this.copyModel, 'medium'),
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

