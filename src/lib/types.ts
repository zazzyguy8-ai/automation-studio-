import { z } from 'zod';

/* ------------------------------------------------------------------ */
/* Shared primitives                                                    */
/* ------------------------------------------------------------------ */

export const LEAD_STAGES = [
  'new',
  'audited',
  'contacted',
  'replied',
  'call',
  'proposal',
  'won',
  'lost',
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const CHANNELS = ['email', 'linkedin', 'instagram'] as const;
export type Channel = (typeof CHANNELS)[number];

/** Every number this system shows the user is one of these. Nothing is ever
 *  rendered as a fact unless it was actually observed on the company's site. */
export const ConfidenceSchema = z.enum(['observed', 'inferred', 'assumed']);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const EvidenceSchema = z.object({
  /** Verbatim text found on the company's public site. */
  quote: z.string().min(3).max(600),
  url: z.string(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

/** A number with its provenance attached. The UI refuses to print a bare number. */
export const EstimateSchema = z.object({
  label: z.string(),
  unit: z.string(),
  low: z.number(),
  base: z.number(),
  high: z.number(),
  confidence: ConfidenceSchema,
  /** Plain-language statement of what had to be true for this number to hold. */
  assumptions: z.array(z.string()).min(1),
  is_estimate: z.literal(true),
});
export type Estimate = z.infer<typeof EstimateSchema>;

/* ------------------------------------------------------------------ */
/* Prospecting                                                          */
/* ------------------------------------------------------------------ */

export const ContactSchema = z.object({
  kind: z.enum(['email', 'phone', 'form', 'whatsapp', 'other']),
  value: z.string(),
  source_url: z.string().optional(),
  label: z.string().optional(),
});
export type Contact = z.infer<typeof ContactSchema>;

export const SocialSchema = z.object({
  platform: z.string(),
  url: z.string(),
});

export const LeadSchema = z.object({
  id: z.string(),
  company_name: z.string(),
  website: z.string(),
  industry: z.string().nullable(),
  country: z.string().nullable(),
  size_hint: z.string().nullable(),
  stage: z.enum(LEAD_STAGES),
  contacts: z.array(ContactSchema),
  socials: z.array(SocialSchema),
  notes: z.string().nullable(),
  source: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Lead = z.infer<typeof LeadSchema>;

export const PageSchema = z.object({
  url: z.string(),
  title: z.string(),
  text: z.string(),
  status: z.number(),
});
export type Page = z.infer<typeof PageSchema>;

export const SnapshotSchema = z.object({
  id: z.string(),
  lead_id: z.string(),
  root_url: z.string(),
  pages: z.array(PageSchema),
  /** Mechanically detected facts. No LLM involved -> these are `observed`. */
  signals: z.object({
    has_contact_form: z.boolean(),
    has_online_booking: z.boolean(),
    has_live_chat: z.boolean(),
    has_pricing_page: z.boolean(),
    phone_numbers: z.array(z.string()),
    emails: z.array(z.string()),
    social_links: z.array(SocialSchema),
    response_promises: z.array(z.string()),
    booking_vendors: z.array(z.string()),
    cms_hints: z.array(z.string()),
  }),
  fetched_at: z.string(),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;

/* ------------------------------------------------------------------ */
/* Audit                                                                */
/* ------------------------------------------------------------------ */

export const WorkflowStepSchema = z.object({
  actor: z.enum(['trigger', 'system', 'ai', 'human']),
  action: z.string().min(6),
  channel: z.string().nullable(),
  integration: z.string().nullable(),
  /** Wall-clock target for this step, e.g. "< 60s". */
  sla: z.string().nullable(),
});
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

export const ScoreSchema = z.object({
  score: z.number().min(1).max(10),
  rationale: z.string().min(10),
});

export const OpportunitySchema = z.object({
  id: z.string(),
  title: z.string().min(8),
  problem_id: z.string(),
  /** Which of the eight agent templates this maps onto. */
  template_key: z.string(),
  /** The concrete chain. Gate below enforces this is a real workflow. */
  workflow_steps: z.array(WorkflowStepSchema).min(4),
  integrations: z.array(z.string()).min(1),
  roi: ScoreSchema.extend({
    driver_metric: z.string(),
  }),
  effort: ScoreSchema.extend({
    build_days: z.number(),
  }),
  urgency: ScoreSchema.extend({
    why_now: z.string(),
  }),
  total_score: z.number().optional(),
});
export type Opportunity = z.infer<typeof OpportunitySchema>;

export const ProblemSchema = z.object({
  id: z.string(),
  title: z.string().min(8),
  description: z.string().min(30),
  category: z.enum([
    'lead_response',
    'lead_capture',
    'booking',
    'follow_up',
    'quoting',
    'reputation',
    'support',
    'internal_admin',
  ]),
  /** Why this costs money. Hypothesis, explicitly not a measurement. */
  revenue_leak_hypothesis: z.string().min(20),
  evidence: z.array(EvidenceSchema).min(1),
});
export type Problem = z.infer<typeof ProblemSchema>;

export const BusinessProfileSchema = z.object({
  what_they_do: z.string().min(20),
  services: z.array(z.string()),
  customer_type: z.enum(['b2c', 'b2b', 'both']),
  booking_model: z.string(),
  intake_channels: z.array(z.string()),
  team_size_hint: z.string().nullable(),
  locations: z.array(z.string()),
});
export type BusinessProfile = z.infer<typeof BusinessProfileSchema>;

export const AuditResultSchema = z.object({
  business_profile: BusinessProfileSchema,
  problems: z.array(ProblemSchema).min(1),
  opportunities: z.array(OpportunitySchema).min(3).max(5),
  recommended_opportunity_id: z.string(),
  recommendation_rationale: z.string().min(30),
});
export type AuditResult = z.infer<typeof AuditResultSchema>;

export const AuditSchema = z.object({
  id: z.string(),
  lead_id: z.string(),
  snapshot_id: z.string(),
  model: z.string(),
  status: z.enum(['ok', 'rejected', 'error']),
  result: AuditResultSchema.nullable(),
  gate_report: z.array(z.string()),
  error: z.string().nullable(),
  created_at: z.string(),
});
export type Audit = z.infer<typeof AuditSchema>;

/* ------------------------------------------------------------------ */
/* Demo                                                                 */
/* ------------------------------------------------------------------ */

export const DemoSceneSchema = z.object({
  t: z.string(),
  on_screen: z.string(),
  narration: z.string(),
});

export const DemoSchema = z.object({
  id: z.string(),
  audit_id: z.string(),
  lead_id: z.string(),
  headline: z.string(),
  before: z.array(z.string()).min(3),
  after: z.array(z.string()).min(3),
  scenes: z.array(DemoSceneSchema).min(4),
  impact: z.array(EstimateSchema),
  /** Inputs the user can override; every impact number derives from these. */
  impact_inputs: z.record(z.number()),
  created_at: z.string(),
});
export type Demo = z.infer<typeof DemoSchema>;

/* ------------------------------------------------------------------ */
/* Outreach                                                             */
/* ------------------------------------------------------------------ */

export const OutreachMessageSchema = z.object({
  id: z.string(),
  lead_id: z.string(),
  audit_id: z.string(),
  channel: z.enum(CHANNELS),
  step: z.number(),
  subject: z.string().nullable(),
  body: z.string(),
  status: z.enum([
    'draft', 'approved', 'queued', 'sent', 'rejected', 'suppressed', 'cancelled', 'failed',
  ]),
  /** Which audit evidence this message leans on. Empty => blocked from approval. */
  grounding: z.array(z.string()),
  approved_at: z.string().nullable(),
  sent_at: z.string().nullable(),
  created_at: z.string(),
  /** Set for engine-generated messages. */
  campaign_id: z.string().nullable().default(null),
  /** Groups the first touch and its follow-ups so a reply can stop all of them. */
  thread_id: z.string().nullable().default(null),
  /** Earliest time a follow-up may go out. Null means "as soon as approved". */
  scheduled_at: z.string().nullable().default(null),
  /** Address actually used, recorded at send time. */
  sent_to: z.string().nullable().default(null),
  /** Why a message ended up cancelled/suppressed/failed. */
  stop_reason: z.string().nullable().default(null),
});
export type OutreachMessage = z.infer<typeof OutreachMessageSchema>;

/* ------------------------------------------------------------------ */
/* Clients / agents                                                     */
/* ------------------------------------------------------------------ */

export const ClientSchema = z.object({
  id: z.string(),
  lead_id: z.string().nullable(),
  name: z.string(),
  country: z.string().nullable(),
  build_fee_eur: z.number().nullable(),
  monthly_fee_eur: z.number().nullable(),
  stripe_customer_id: z.string().nullable(),
  created_at: z.string(),
});
export type Client = z.infer<typeof ClientSchema>;

export const CredentialRefSchema = z.object({
  provider: z.string(),
  /** The NAME of the env var / n8n credential. Never the value. */
  env_var: z.string(),
  scope: z.string(),
  required: z.boolean(),
  status: z.enum(['missing', 'configured', 'verified']),
  docs_url: z.string().nullable(),
});
export type CredentialRef = z.infer<typeof CredentialRefSchema>;

export const BlueprintStepSchema = z.object({
  key: z.string(),
  title: z.string(),
  actor: z.enum(['trigger', 'system', 'ai', 'human']),
  description: z.string(),
  integration: z.string().nullable(),
  config_keys: z.array(z.string()),
  test: z.object({
    how: z.string(),
    expect: z.string(),
  }),
  status: z.enum(['todo', 'passed', 'failed']).default('todo'),
});
export type BlueprintStep = z.infer<typeof BlueprintStepSchema>;

export const BlueprintSchema = z.object({
  template_key: z.string(),
  template_name: z.string(),
  summary: z.string(),
  steps: z.array(BlueprintStepSchema),
  credentials: z.array(CredentialRefSchema),
  integrations: z.array(z.string()),
  human_handoff: z.object({
    triggers: z.array(z.string()),
    route_to: z.string(),
    sla: z.string(),
  }),
  deployment_checklist: z.array(z.string()),
  guardrails: z.array(z.string()),
});
export type Blueprint = z.infer<typeof BlueprintSchema>;

export const AgentSchema = z.object({
  id: z.string(),
  client_id: z.string(),
  name: z.string(),
  template_key: z.string(),
  status: z.enum(['draft', 'testing', 'live', 'paused']),
  blueprint: BlueprintSchema,
  created_at: z.string(),
});
export type Agent = z.infer<typeof AgentSchema>;

export const ExecutionSchema = z.object({
  id: z.string(),
  agent_id: z.string(),
  status: z.enum(['success', 'error', 'handoff']),
  outcome: z.object({
    lead_handled: z.boolean(),
    appointment_booked: z.boolean(),
    follow_up_sent: z.boolean(),
    human_handoff: z.boolean(),
    review_requested: z.boolean(),
  }),
  minutes_saved: z.number(),
  revenue_influenced_eur: z.number(),
  error: z.string().nullable(),
  started_at: z.string(),
});
export type Execution = z.infer<typeof ExecutionSchema>;

/* ------------------------------------------------------------------ */
/* Outreach engine                                                      */
/* ------------------------------------------------------------------ */

/**
 * A message moves: draft -> approved -> queued -> sent.
 *
 * `suppressed` and `cancelled` are terminal and deliberately distinct:
 * suppressed means we must not contact this address at all, cancelled means
 * this particular follow-up is no longer wanted (they replied). Collapsing
 * them would lose the reason a message never went out.
 */
export const MESSAGE_STATUSES = [
  'draft', 'approved', 'queued', 'sent', 'rejected', 'suppressed', 'cancelled', 'failed',
] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const REPLY_CLASSES = [
  'positive', 'booked', 'question', 'not_now', 'negative', 'unsubscribe', 'auto_reply', 'bounce',
] as const;
export type ReplyClass = (typeof REPLY_CLASSES)[number];

export const ReplySchema = z.object({
  id: z.string(),
  lead_id: z.string(),
  message_id: z.string().nullable(),
  channel: z.enum(CHANNELS),
  from_address: z.string(),
  subject: z.string().nullable(),
  body: z.string(),
  classification: z.enum(REPLY_CLASSES),
  /** Why the classifier decided this, so a wrong call is debuggable. */
  classification_reason: z.string(),
  received_at: z.string(),
  handled: z.boolean(),
});
export type Reply = z.infer<typeof ReplySchema>;

/** Never contact again. The list is append-only on purpose. */
export const SuppressionSchema = z.object({
  id: z.string(),
  /** Lower-cased email, or a bare domain to block everyone there. */
  value: z.string(),
  scope: z.enum(['address', 'domain']),
  reason: z.enum(['unsubscribe', 'complaint', 'hard_bounce', 'manual', 'never_contact']),
  note: z.string().nullable(),
  created_at: z.string(),
});
export type Suppression = z.infer<typeof SuppressionSchema>;

export const CampaignSchema = z.object({
  id: z.string(),
  name: z.string(),
  industry: z.string(),
  country: z.string(),
  city: z.string().nullable(),
  /** How many companies to discover per run. */
  daily_target: z.number(),
  /** How many of those to actually draft outreach for. */
  daily_send_cap: z.number(),
  /**
   * How far down the pipeline this campaign is allowed to go.
   *
   * 'contacts_only' stops after discovery - a list of verified companies and
   * public contact details, nothing read and nothing written. 'research_only'
   * adds the audit, so the user gets the problem worth selling against and
   * writes the message themselves. 'email' is the full pipeline, still gated
   * on approval before anything sends.
   *
   * Defaulted rather than required so campaigns created before this existed
   * keep parsing, and keep the behaviour they already had.
   */
  outreach_mode: z.enum(['contacts_only', 'research_only', 'email']).default('email'),
  build_fee_eur: z.number(),
  monthly_fee_eur: z.number(),
  status: z.enum(['active', 'paused']),
  created_at: z.string(),
});
export type Campaign = z.infer<typeof CampaignSchema>;

/**
 * Single row of engine state. The kill switch lives here rather than in an
 * env var so it can be flipped from the UI and takes effect on the next send,
 * without a redeploy.
 */
export const EngineStateSchema = z.object({
  id: z.literal('singleton'),
  /** When true, nothing is sent. Checked before every individual send. */
  kill_switch: z.boolean(),
  kill_switch_reason: z.string().nullable(),
  /** Rolling counters, reset by date. */
  counter_date: z.string(),
  sent_today: z.number(),
  /** Caps. Deliberately conservative defaults. */
  daily_send_cap: z.number(),
  hourly_send_cap: z.number(),
  min_seconds_between_sends: z.number(),
  /** Local-time window outside which nothing is sent. */
  quiet_hours_start: z.number(),
  quiet_hours_end: z.number(),
  last_sent_at: z.string().nullable(),
  updated_at: z.string(),
});
export type EngineState = z.infer<typeof EngineStateSchema>;
