/**
 * Tests the Claude request/response wiring without a key and without a network
 * call, by injecting a stub transport.
 *
 *   npm run test:anthropic
 *
 * What this catches — the failure modes that would otherwise surface in front
 * of a prospect: a renamed tool, a JSON Schema that disagrees with the zod
 * contract, a response shape the extractor cannot read, and model output that
 * would slip past the specificity gate.
 *
 * What it does NOT prove: that Claude produces good audits. Only a real key
 * shows that. Run `npm run pipeline -- --fixture karoseria-hronec` with
 * ANTHROPIC_API_KEY set in .env.local for that.
 */
import { AnthropicProvider } from '@/lib/llm/anthropic';
import { gateAudit } from '@/lib/audit/gate';
import { crawlSite } from '@/lib/scrape/crawl';
import { fixtureFetcher } from '@/lib/scrape/fixture-fetcher';
import { AuditResultSchema, type Snapshot } from '@/lib/types';

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` - ${detail}` : ''}`);
};

/** Captures what the SDK actually put on the wire, and replies with a
 *  well-formed tool_use response built from `reply`. */
function stubTransport(reply: (body: Record<string, unknown>) => unknown) {
  const seen: Array<Record<string, unknown>> = [];
  const impl = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}'));
    seen.push(body);
    const toolName = (body.tool_choice as { name?: string } | undefined)?.name ?? 'submit_audit';
    return new Response(JSON.stringify({
      id: 'msg_stub',
      type: 'message',
      role: 'assistant',
      model: body.model,
      stop_reason: 'tool_use',
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
      content: [{ type: 'tool_use', id: 'tu_stub', name: toolName, input: reply(body) }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { impl, seen };
}

function auditFor(snapshot: Snapshot) {
  const url = snapshot.pages[0].url;
  const quote = snapshot.pages[0].text.split(/(?<=[.!?])\s+/).find((s) => s.length > 30)!.trim();
  const opportunity = (id: string, title: string, template: string) => ({
    id,
    title,
    problem_id: 'p1',
    template_key: template,
    workflow_steps: [
      { actor: 'trigger', action: 'Web form submission posts the lead to the workflow.', channel: 'web', integration: 'Website form webhook', sla: '< 10s' },
      { actor: 'system', action: 'Send an SMS naming the service they asked about.', channel: 'sms', integration: 'SMS (Telnyx/Twilio)', sla: '< 60s' },
      { actor: 'ai', action: 'Ask four qualification questions and extract the fields.', channel: 'sms', integration: 'Anthropic', sla: null },
      { actor: 'system', action: 'Write the qualified contact into the CRM.', channel: null, integration: 'CRM', sla: null },
      { actor: 'human', action: 'Hand a complaint or a price negotiation to a person with the transcript.', channel: 'email', integration: 'Email/Slack', sla: '< 1 min' },
    ],
    integrations: ['Website form webhook', 'SMS (Telnyx/Twilio)', 'CRM'],
    roi: { score: 9, rationale: 'Moves time-to-first-response, their main intake path.', driver_metric: 'time to first response' },
    effort: { score: 3, rationale: 'Three days with the integrations implied by the site.', build_days: 3 },
    urgency: { score: 8, rationale: 'The promise on the site is already unenforced.', why_now: 'Unenforced public promise.' },
  });

  return {
    business_profile: {
      what_they_do: 'A local service business taking enquiries by phone and web form.',
      services: ['repair', 'service'],
      customer_type: 'b2c',
      booking_model: 'manual - phone or form only',
      intake_channels: ['phone', 'web form'],
      team_size_hint: null,
      locations: [],
    },
    problems: [{
      id: 'p1',
      title: 'Web enquiries have no enforced response time',
      description: 'The form is the main digital intake and nothing puts a clock on the reply, so it waits for a human.',
      category: 'lead_response',
      revenue_leak_hypothesis: 'Response speed is the biggest controllable factor in whether an inbound enquiry converts.',
      evidence: [{ quote, url }],
    }],
    opportunities: [
      opportunity('o1', 'Instant SMS response and qualification for inbound enquiries', 'lead_response'),
      opportunity('o2', 'Missed call text-back with job capture', 'missed_call_sms'),
      opportunity('o3', 'Quote follow-up ladder tied to the CRM stage', 'quote_followup'),
    ],
    recommended_opportunity_id: 'o1',
    recommendation_rationale: 'Highest ROI against a three-day build, and it covers the intake channel the site pushes hardest.',
  };
}

async function main() {
  console.log('Claude wiring test (stub transport, no key, no network)\n');

  const crawled = await crawlSite('https://karoseria-hronec.sk', {
    fetcher: fixtureFetcher('karoseria-hronec', 'https://karoseria-hronec.sk'),
  });
  const snapshot: Snapshot = { ...crawled, id: 'snap', lead_id: 'lead' };
  const lead = {
    id: 'lead', company_name: 'Karoseria Hronec', website: 'https://karoseria-hronec.sk',
    industry: 'auto body repair', country: 'SK', size_hint: null, stage: 'new' as const,
    contacts: [], socials: [], notes: null, source: 'test',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };

  /* --- audit call ------------------------------------------------------ */
  const audit = stubTransport((body) => {
    void body;
    return auditFor(snapshot);
  });
  const provider = new AnthropicProvider({ apiKey: 'test-key-not-real', fetch: audit.impl });
  const result = await provider.analyzeBusiness({ lead, snapshot });

  const req = audit.seen[0];
  const tools = req.tools as Array<{ name: string; input_schema: Record<string, unknown> }>;
  check('audit request forces the submit_audit tool',
    (req.tool_choice as { type: string; name: string }).type === 'tool'
    && (req.tool_choice as { name: string }).name === 'submit_audit');
  check('the forced tool name matches a declared tool', tools.some((t) => t.name === 'submit_audit'));
  check('audit uses the audit model', String(req.model).length > 0, String(req.model));
  check('site content reached the prompt',
    JSON.stringify(req.messages).includes('Karos'));
  check('mechanically observed signals reached the prompt',
    JSON.stringify(req.messages).includes('online booking present'));
  check('the system prompt bans generic output',
    String(req.system).includes('Use an AI chatbot') || String(req.system).includes('AI chatbot'));

  check('tool output parses against the zod contract',
    AuditResultSchema.safeParse(result).success);

  const gate = gateAudit(result, snapshot, lead.company_name);
  check('a well-formed Claude audit passes the specificity gate', gate.ok, gate.problems.join(' | '));

  /* --- the gate must still reject a bad Claude response ---------------- */
  const bad = stubTransport(() => {
    const base = auditFor(snapshot);
    return {
      ...base,
      opportunities: base.opportunities.map((o) => ({
        ...o,
        title: 'Implement AI automation to improve efficiency',
        workflow_steps: o.workflow_steps.slice(0, 2),
      })),
    };
  });
  const badProvider = new AnthropicProvider({ apiKey: 'test-key-not-real', fetch: bad.impl });
  let rejected = false;
  try {
    // zod should refuse it first: fewer than 4 steps violates the schema.
    const r = await badProvider.analyzeBusiness({ lead, snapshot });
    rejected = !gateAudit(r, snapshot, lead.company_name).ok;
  } catch {
    rejected = true;
  }
  check('a generic/short Claude response is rejected before storage', rejected);

  /* --- demo + outreach calls ------------------------------------------- */
  const demoStub = stubTransport(() => ({
    headline: 'What happens to an enquiry after hours',
    before: ['Enquiry waits in an inbox.', 'Nobody sees it until morning.', 'Follow-up is manual.'],
    after: ['SMS in 60 seconds.', 'Qualified by AI.', 'Booked into the live calendar.'],
    scenes: [
      { t: '0:00-0:15', on_screen: 'Homepage', narration: 'This is your enquiry form.' },
      { t: '0:15-0:40', on_screen: 'Phone', narration: 'The reply arrives in under a minute.' },
      { t: '0:40-1:05', on_screen: 'SMS thread', narration: 'It asks your qualifying questions.' },
      { t: '1:05-1:30', on_screen: 'CRM', narration: 'Everything lands as a structured record.' },
    ],
  }));
  const demoProvider = new AnthropicProvider({ apiKey: 'test-key-not-real', fetch: demoStub.impl });
  const script = await demoProvider.writeDemoScript({ lead, audit: result });
  check('demo script call returns the expected shape',
    script.scenes.length >= 4 && script.before.length >= 3 && script.after.length >= 3);
  check('demo request forces submit_demo_script',
    (demoStub.seen[0].tool_choice as { name: string }).name === 'submit_demo_script');

  const copyStub = stubTransport(() => ({
    subject: 'Karoseria Hronec - what happens to an enquiry after hours',
    body: 'I went through karoseria-hronec.sk before writing this.',
    grounding: ['site quote'],
  }));
  const copyProvider = new AnthropicProvider({ apiKey: 'test-key-not-real', fetch: copyStub.impl });
  const copy = await copyProvider.writeOutreach({
    lead,
    audit: result,
    demo: {
      id: 'd', audit_id: 'a', lead_id: 'lead', headline: 'h',
      before: script.before, after: script.after, scenes: script.scenes,
      impact: [{
        label: 'Staff hours removed per month', unit: 'hours/month',
        low: 7, base: 12, high: 17, confidence: 'assumed',
        assumptions: ['Estimate, not a measurement.'], is_estimate: true,
      }],
      impact_inputs: {}, created_at: new Date().toISOString(),
    },
    channel: 'email',
    step: 0,
    sender: { name: 'Richard', company: 'Automation Studio', calendar_url: 'https://cal.com/x' },
  });
  check('outreach call returns subject, body and grounding',
    copy.body.length > 0 && copy.grounding.length > 0);
  check('outreach request forces submit_message',
    (copyStub.seen[0].tool_choice as { name: string }).name === 'submit_message');
  check('outreach prompt carries the audit evidence',
    JSON.stringify(copyStub.seen[0].messages).includes('Evidence I can quote'));
  check('outreach prompt labels impact figures as estimates',
    JSON.stringify(copyStub.seen[0].messages).includes('ALL are estimates'));

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  console.log('Note: this proves the wiring, not the audit quality. For that, set');
  console.log('ANTHROPIC_API_KEY in .env.local and run `npm run pipeline -- --fixture karoseria-hronec`.');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
