import type { AuditResult, Evidence, Opportunity, Page, Problem, Snapshot } from '@/lib/types';
import { getTemplate } from '@/lib/blueprint/templates';
import type { AuditInput, CopyInput, CopyOutput, ReasoningProvider } from './provider';

/* ------------------------------------------------------------------ */
/* Evidence helpers — a claim is only allowed if we can quote it.       */
/* ------------------------------------------------------------------ */

function sentences(page: Page): string[] {
  return page.text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length >= 15 && s.length <= 300);
}

function findQuote(pages: Page[], re: RegExp): Evidence | null {
  for (const page of pages) {
    for (const s of sentences(page)) {
      if (re.test(s)) return { quote: s.slice(0, 300), url: page.url };
    }
  }
  return null;
}

function findAllQuotes(pages: Page[], re: RegExp, limit = 2): Evidence[] {
  const out: Evidence[] = [];
  for (const page of pages) {
    for (const s of sentences(page)) {
      if (re.test(s)) {
        out.push({ quote: s.slice(0, 300), url: page.url });
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

const SERVICE_HINT =
  /\b(repair|service|servis|installation|instalac|maintenance|udrzb|consultation|konzult|treatment|osetren|cleaning|cistenie|inspection|revizi|renovation|rekonstruk|valuation|ocenen|sale|predaj|rental|prenajom|design|projekt|check[- ]?up|therapy|terapi)\w*\b/gi;

function guessServices(pages: Page[]): string[] {
  const counts = new Map<string, number>();
  for (const p of pages) {
    for (const m of p.text.matchAll(SERVICE_HINT)) {
      const word = m[0].toLowerCase();
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([w]) => w);
}

/* ------------------------------------------------------------------ */
/* Rules                                                               */
/* ------------------------------------------------------------------ */

interface Rule {
  id: string;
  template_key: string;
  category: Problem['category'];
  title: string;
  /** Returns null when the site gives no grounds for this problem. */
  match(ctx: RuleContext): { evidence: Evidence[]; description: string; leak: string } | null;
  score(ctx: RuleContext): { roi: number; effort: number; urgency: number; why_now: string; driver: string };
}

interface RuleContext {
  pages: Page[];
  signals: Snapshot['signals'];
  company: string;
}

const RULES: Rule[] = [
  {
    id: 'p_phone_first',
    template_key: 'missed_call_sms',
    category: 'lead_response',
    title: 'Phone is the main intake channel and unanswered calls leave no trace',
    match: ({ pages, signals }) => {
      if (signals.phone_numbers.length === 0) return null;
      const evidence = findAllQuotes(
        pages, /\b(call us|call |phone|telefon|telefón|volajte|zavolajte|zavolejte|zastihnete|ring us|reach us)/i, 2);
      if (evidence.length === 0) return null;
      return {
        evidence,
        description:
          'The site pushes a phone number as the primary way to make contact, and there is no automatic fallback when '
          + 'nobody picks up. A caller who reaches a busy line or voicemail leaves no record anywhere: no lead, no callback task, nothing to follow up.',
        leak:
          'Every unanswered call is a lead that the business cannot even count, let alone recover. In trades and clinics '
          + 'the caller typically dials the next result rather than leaving a voicemail.',
      };
    },
    score: ({ signals }) => ({
      roi: signals.has_online_booking ? 7 : 9,
      effort: 2,
      urgency: signals.has_live_chat ? 6 : 8,
      why_now: 'Nothing currently records a missed call, so the loss is invisible and compounding.',
      driver: 'missed calls converted into logged leads',
    }),
  },
  {
    id: 'p_slow_form',
    template_key: 'lead_response',
    category: 'lead_response',
    title: 'Web enquiries land in an inbox with no enforced response time',
    match: ({ pages, signals }) => {
      if (!signals.has_contact_form) return null;
      const promise = signals.response_promises[0];
      const evidence = promise
        ? [{ quote: promise, url: pages[0].url }]
        : findAllQuotes(
            pages,
            /(\bcontact\b|enquir|inquir|get in touch|send us|nap[ií][sš]te|kontaktujte|vypl[nň]te|poptávk|poptavk|request)/i,
            2);
      if (evidence.length === 0) return null;
      return {
        evidence,
        description: promise
          ? `The site makes an explicit response promise ("${promise}"). Nothing on the page enforces it — the promise depends on a human reading an inbox.`
          : 'The contact form is the main digital intake and there is no stated or automated response time. The enquiry sits in an inbox until somebody opens it.',
        leak:
          'Response speed is the single biggest controllable factor in whether an inbound enquiry converts. A promise measured '
          + 'in hours competes against businesses that reply in seconds.',
      };
    },
    score: ({ signals }) => ({
      roi: 9,
      effort: 3,
      urgency: signals.response_promises.length > 0 ? 9 : 7,
      why_now: signals.response_promises.length > 0
        ? 'The site already promises a response time, so failing it is a visible broken promise.'
        : 'Enquiries currently have no owner and no clock.',
      driver: 'time-to-first-response on web enquiries',
    }),
  },
  {
    id: 'p_no_booking',
    template_key: 'ai_receptionist',
    category: 'booking',
    title: 'Appointments are arranged by hand rather than booked online',
    match: ({ pages, signals }) => {
      if (signals.has_online_booking) return null;
      const evidence = findAllQuotes(
        pages,
        /(\bappointments?\b|\bbooking\b|\bbook\b|schedule|term[ií]n|objedn|rezerv|prohl[ií]dk|obhliadk|opening hours|otv[aá]rac|consultation|visit us)/i,
        2);
      if (evidence.length === 0) return null;
      return {
        evidence,
        description:
          'The site talks about appointments and visits but offers no way to book one. Every booking therefore costs a '
          + 'phone call or an email thread, and can only happen while someone is at the desk.',
        leak:
          'Bookings are capped by staffed hours, and back-and-forth scheduling loses the people who were ready to commit.',
      };
    },
    score: ({ signals }) => ({
      roi: 8,
      effort: 4,
      urgency: signals.has_contact_form ? 6 : 8,
      why_now: 'Demand that arrives outside opening hours currently has nowhere to go.',
      driver: 'appointments booked without staff involvement',
    }),
  },
  {
    id: 'p_quotes',
    template_key: 'quote_followup',
    category: 'quoting',
    title: 'Quotes and estimates are sent, then chased from memory',
    match: ({ pages }) => {
      const evidence = findAllQuotes(
        pages,
        /(\bquote\b|\bestimate\b|cenov[aáou]{1,3} (ponuk|nab[ií]dk)|ponuku|nab[ií]dku|ocen[eě]n[ií]|odhad|proposal|treatment plan|cost estimate|nacenen)/i,
        2);
      if (evidence.length === 0) return null;
      return {
        evidence,
        description:
          'Quoting is a core part of how this business sells, and the site invites people to request one. There is no '
          + 'visible mechanism that follows a quote once it has been sent.',
        leak:
          'Unchased quotes are the highest-value leak in a quoting business: the work of producing them is already paid for, '
          + 'and the prospect has already shown intent.',
      };
    },
    score: () => ({
      roi: 9, effort: 2, urgency: 7,
      why_now: 'Every quote already sent and not chased is money left on the table today.',
      driver: 'quote-to-close rate',
    }),
  },
  {
    id: 'p_support_load',
    template_key: 'support_faq',
    category: 'support',
    title: 'The same questions are answered by hand, all day',
    match: ({ pages, signals }) => {
      if (signals.has_live_chat) return null;
      const evidence = findAllQuotes(
        pages,
        /(\bfaq\b|frequently asked|opening hours|otv[aá]rac|otev[ří]rac|how do i|what should i|do you offer|policy|jak to prob[ií]h[aá])/i,
        2);
      if (evidence.length < 1) return null;
      return {
        evidence,
        description:
          'The site carries enough policy, hours and FAQ content to show which questions come up repeatedly. Those same '
          + 'questions arrive by phone and email, and a person answers each one individually.',
        leak: 'Repetitive answering consumes the hours of whoever is closest to the phone — usually the person who should be selling or delivering.',
      };
    },
    score: () => ({
      roi: 6, effort: 3, urgency: 5,
      why_now: 'The content already exists, so the knowledge base is mostly assembled.',
      driver: 'staff hours spent on repeat questions',
    }),
  },
  {
    id: 'p_no_reactivation',
    template_key: 'lead_followup',
    category: 'follow_up',
    title: 'Past enquiries and past customers are never contacted again',
    match: ({ pages, signals }) => {
      const evidence = findAllQuotes(
        pages,
        /(\bcustomers?\b|\bclients?\b|z[aá]kazn[ií]k|klient|patients?\b|pacient|we have (helped|served)|spokojen|obslou[zž]|zprost[rř]edkoval|years)/i,
        2);
      if (evidence.length === 0) return null;
      if (signals.has_online_booking && signals.has_live_chat) return null;
      return {
        evidence,
        description:
          'There is an accumulated list of people who enquired or bought, and nothing on the site or in the visible stack '
          + 'brings them back. Reactivation currently depends on somebody remembering.',
        leak: 'The cheapest lead is one already in the database — reaching them costs nothing but the message.',
      };
    },
    score: () => ({
      roi: 7, effort: 2, urgency: 5,
      why_now: 'The list already exists and grows unused every week.',
      driver: 'revenue from dormant contacts',
    }),
  },
  {
    id: 'p_reviews',
    template_key: 'review_request',
    category: 'reputation',
    title: 'Reviews are left to chance',
    match: ({ pages, signals }) => {
      const evidence = findAllQuotes(
        pages, /(\breviews?\b|testimonial|rating|recenz|hodnocen|hodnoten|referenc|what our|stars|rated)/i, 2);
      if (evidence.length === 0) return null;
      if (signals.social_links.length === 0 && !signals.has_contact_form) return null;
      return {
        evidence,
        description:
          'Reviews clearly matter to how this business is chosen, but asking for them is manual and therefore inconsistent — '
          + 'it happens when someone remembers, which is usually after the customer has moved on.',
        leak: 'Review volume and recency drive local search ranking and click-through, so an inconsistent ask suppresses inbound volume.',
      };
    },
    score: () => ({
      roi: 5, effort: 1, urgency: 4,
      why_now: 'The ask has to happen within hours of the job to work at all.',
      driver: 'review volume per completed job',
    }),
  },
  {
    id: 'p_admin',
    template_key: 'internal_admin',
    category: 'internal_admin',
    title: 'Customer details are retyped from email into another system',
    match: ({ pages }) => {
      const evidence = findAllQuotes(
        pages,
        /(send (us|it|them)|upload|\bdocuments?\b|dokument|po[sš]lete|za[sš]lete|attach|registration form|fill in|vypl[nň]te|insurance card|list vlastnictv)/i,
        2);
      if (evidence.length === 0) return null;
      return {
        evidence,
        description:
          'The intake process asks people to send details or documents by email or form. Somebody then reads each one and '
          + 'copies the fields into whichever system actually runs the business.',
        leak: 'Retyping is slow, error-prone, and scales linearly with volume — it is the first thing that breaks when the business grows.',
      };
    },
    score: () => ({
      roi: 6, effort: 3, urgency: 4,
      why_now: 'Cost grows with every new customer until it is removed.',
      driver: 'admin minutes per intake',
    }),
  },
];

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

/** Deterministic analyst driven purely by observed site signals.
 *
 *  Purpose: (1) the pipeline runs end-to-end with no API key, (2) tests are
 *  reproducible. It is a floor, not a replacement — real runs should use
 *  Claude, which reads the actual prose rather than pattern-matching it. */
export class HeuristicProvider implements ReasoningProvider {
  readonly name = 'heuristic';

  async analyzeBusiness({ lead, snapshot }: AuditInput): Promise<AuditResult> {
    const ctx: RuleContext = { pages: snapshot.pages, signals: snapshot.signals, company: lead.company_name };
    const problems: Problem[] = [];
    const opportunities: Opportunity[] = [];

    for (const rule of RULES) {
      const hit = rule.match(ctx);
      if (!hit) continue;
      const template = getTemplate(rule.template_key);
      if (!template) continue;

      problems.push({
        id: rule.id,
        title: rule.title,
        description: hit.description,
        category: rule.category,
        revenue_leak_hypothesis: hit.leak,
        evidence: hit.evidence,
      });

      const s = rule.score(ctx);
      opportunities.push({
        id: `o_${rule.id}`,
        title: `${template.name} for ${lead.company_name}`,
        problem_id: rule.id,
        template_key: template.key,
        workflow_steps: template.steps.map((st) => ({
          actor: st.actor,
          action: st.description,
          channel: st.integration?.toLowerCase().includes('sms') ? 'sms'
            : st.integration?.toLowerCase().includes('voice') ? 'voice'
            : st.integration?.toLowerCase().includes('email') ? 'email' : null,
          integration: st.integration,
          sla: st.key === 'instant_reply' ? '< 60s' : st.key === 'sms' ? '< 2 min' : null,
        })),
        integrations: template.integrations,
        roi: { score: s.roi, rationale: `Moves ${s.driver} for ${lead.company_name}.`, driver_metric: s.driver },
        effort: {
          score: s.effort,
          rationale: `Roughly ${template.build_days} build day(s) with the integrations this business already implies.`,
          build_days: template.build_days,
        },
        urgency: { score: s.urgency, rationale: s.why_now, why_now: s.why_now },
      });
    }

    if (opportunities.length === 0) {
      throw new Error('no automation opportunity could be grounded in the fetched site content');
    }

    const services = guessServices(snapshot.pages);
    const text = snapshot.pages.map((p) => p.text).join(' ');
    const b2b = /\b(b2b|businesses|companies|firmy|enterprise|contractors|suppliers)\b/i.test(text);
    const b2c = /\b(patients|customers|families|homeowners|pacient|zakaznik)\b/i.test(text);

    return {
      business_profile: {
        what_they_do: (snapshot.pages[0].title || lead.company_name)
          + ' — ' + (sentences(snapshot.pages[0])[0] ?? 'no descriptive text found on the homepage').slice(0, 220),
        services,
        customer_type: b2b && b2c ? 'both' : b2b ? 'b2b' : 'b2c',
        booking_model: snapshot.signals.has_online_booking
          ? `online booking present${snapshot.signals.booking_vendors.length ? ` (${snapshot.signals.booking_vendors.join(', ')})` : ''}`
          : 'manual — phone or form only',
        intake_channels: [
          ...(snapshot.signals.phone_numbers.length ? ['phone'] : []),
          ...(snapshot.signals.has_contact_form ? ['web form'] : []),
          ...(snapshot.signals.emails.length ? ['email'] : []),
          ...(snapshot.signals.has_live_chat ? ['live chat'] : []),
          ...snapshot.signals.social_links.map((l) => l.platform),
        ],
        team_size_hint: lead.size_hint,
        locations: lead.country ? [lead.country] : [],
      },
      problems,
      opportunities: rank(opportunities).slice(0, 5),
      recommended_opportunity_id: rank(opportunities)[0].id,
      recommendation_rationale:
        `Highest combined ROI/urgency against build effort for ${lead.company_name}, and it addresses the intake channel `
        + `their own site pushes hardest (${snapshot.signals.has_online_booking ? 'booking' : snapshot.signals.phone_numbers.length ? 'phone' : 'web form'}).`,
    };
  }

  async writeDemoScript({ lead, audit }: { lead: import('@/lib/types').Lead; audit: AuditResult }) {
    const winner = audit.opportunities.find((o) => o.id === audit.recommended_opportunity_id)!;
    const problem = audit.problems.find((p) => p.id === winner.problem_id)!;
    const steps = winner.workflow_steps;
    return {
      headline: `${lead.company_name}: ${problem.title.toLowerCase()} — and what it looks like automated`,
      before: [
        `Enquiry arrives via ${audit.business_profile.intake_channels[0] ?? 'the website'}.`,
        'It waits in an inbox or a voicemail until a person is free.',
        'Qualification, CRM entry and booking are all done by hand, in sequence.',
        'Follow-up happens only if somebody remembers.',
      ],
      after: steps.slice(0, 5).map((s) => `[${s.actor}] ${s.action.slice(0, 140)}${s.sla ? ` (${s.sla})` : ''}`),
      scenes: [
        {
          t: '0:00-0:12',
          on_screen: `${lead.website} homepage, cursor on the ${audit.business_profile.intake_channels[0] ?? 'contact'} route`,
          narration: `This is ${lead.company_name}. Right now, when someone gets in touch here, ${problem.description.split('.')[1]?.trim().toLowerCase() ?? 'it waits for a person'}.`,
        },
        {
          t: '0:12-0:35',
          on_screen: 'Submitting a real enquiry, phone visible next to the screen',
          narration: `Watch what happens with the automation running. I submit an enquiry as a customer would${steps[1]?.sla ? `, and ${steps[1].sla} later the reply is already on the phone` : ''}.`,
        },
        {
          t: '0:35-1:00',
          on_screen: 'SMS thread: qualification questions and answers',
          narration: 'It asks the qualifying questions you would ask, in your words, and stops when it has what it needs.',
        },
        {
          t: '1:00-1:20',
          on_screen: 'CRM record filling in, then calendar slots offered',
          narration: 'Everything lands in your CRM as a structured record, and the qualified ones get offered real slots from your live calendar.',
        },
        {
          t: '1:20-1:40',
          on_screen: 'Handoff notification arriving',
          narration: 'Anything it should not handle — a complaint, a price negotiation — stops and comes to you with the full transcript. These figures are estimates based on stated assumptions, not measurements of your business.',
        },
      ],
    };
  }

  async writeOutreach({ lead, audit, demo, channel, step }: CopyInput): Promise<CopyOutput> {
    const winner = audit.opportunities.find((o) => o.id === audit.recommended_opportunity_id)!;
    const problem = audit.problems.find((p) => p.id === winner.problem_id)!;
    const quote = problem.evidence[0];
    const chain = winner.workflow_steps.slice(0, 4)
      .map((s) => s.action.split(/[.;]/)[0].toLowerCase().trim()).join(' → ');
    const impact = demo.impact[0];
    const grounding = [
      `site quote: "${quote.quote}" (${quote.url})`,
      `observed: ${audit.business_profile.booking_model}`,
      `problem: ${problem.title}`,
    ];

    if (channel !== 'email') {
      // A DM has to survive a phone screen: two steps of the chain, not four.
      const shortChain = winner.workflow_steps
        .filter((s) => s.actor !== 'trigger')
        .slice(0, 2)
        .map((s) => s.action.split(/[.,;(]/)[0].toLowerCase().trim())
        .join(', then ');
      const bodies = [
        `Your site says: "${quote.quote.slice(0, 80)}". The fix I build: ${shortChain}. Recorded a 90-second walkthrough for ${lead.company_name} using your own services - want it? No pitch if it's not relevant.`,
        `Following up on ${lead.company_name} — the ${problem.title.toLowerCase()} thing. I recorded the walkthrough using your own service names. Send it over? Say no and I'll drop it.`,
      ];
      return { subject: null, body: bodies[Math.min(step, bodies.length - 1)], grounding };
    }

    const first = `I went through ${lead.website} properly before writing this.

On ${quote.url} you say: "${quote.quote.slice(0, 140)}"

${problem.description.split('.').slice(0, 2).join('.')}.

The specific thing I'd build: ${chain}, with a human handoff the moment it hits a complaint or a price negotiation.

${impact ? `Rough scale, and I want to be clear this is an estimate from stated assumptions rather than a measurement of your business: ${impact.low}–${impact.high} ${impact.unit} (${impact.label.toLowerCase()}).` : ''}

I've recorded a 90-second walkthrough using your services and wording. Want me to send it? If this isn't relevant, say so and I won't follow up.`;

    const followups = [
      `Following up once on the ${problem.title.toLowerCase()} note.

The part I'd start with for ${lead.company_name} is narrow: ${winner.workflow_steps[1]?.action.split('.')[0] ?? chain}. That alone is a couple of days of work.

Worth 15 minutes, or should I close the file?`,
      `Last one from me.

Leaving the walkthrough for ${lead.company_name} here in case timing changes — it's built around "${quote.quote.slice(0, 70)}" from your own site.

If it's a no, no reply needed.`,
    ];

    return {
      subject: step === 0
        ? `${lead.company_name} — what happens to an enquiry after hours`
        : `Re: ${lead.company_name} — ${problem.title.slice(0, 50)}`,
      body: step === 0 ? first : followups[Math.min(step - 1, followups.length - 1)],
      grounding,
    };
  }
}

/** ROI and urgency pull up, effort pulls down. Effort is inverted so a
 *  1-day build beats a 4-day build at equal value. */
export function rank(opportunities: Opportunity[]): Opportunity[] {
  return [...opportunities]
    .map((o) => ({ ...o, total_score: scoreOpportunity(o) }))
    .sort((a, b) => (b.total_score ?? 0) - (a.total_score ?? 0));
}

export function scoreOpportunity(o: Opportunity): number {
  return Number((o.roi.score * 0.45 + o.urgency.score * 0.3 + (11 - o.effort.score) * 0.25).toFixed(2));
}
