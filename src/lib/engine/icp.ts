/**
 * The ICP for experiment 01, and the reasoning behind it.
 *
 * This is configuration, not machinery. It exists as code so the campaign, the
 * offer and the decision thresholds cannot drift apart from each other, and so
 * a later experiment is a diff rather than a rewrite.
 */

export interface DecisionThreshold {
  metric: string;
  /** What must be true after 100 leads for the experiment to be a pass. */
  pass_at: string;
  /** What it means if it comes in under, which is the part that matters. */
  if_below: string;
}

export interface Icp {
  key: string;
  name: string;
  industry: string;
  country: string;
  /** Cities are the unit of discovery: a country-wide OSM query is unusable. */
  cities: string[];
  /** Why this one, in the terms that decide it. */
  why: string[];
  /** Why the obvious alternatives were not chosen. */
  rejected: Array<{ option: string; reason: string }>;
  /** The single problem being sold against. */
  problem: string;
  /** How the audit is expected to evidence it from the public site. */
  evidence_expected: string[];
  agent_template: string;
  offer: {
    build_gbp: [number, number];
    monthly_gbp: [number, number];
    /** The arithmetic that makes the price defensible. */
    justification: string;
  };
  thresholds: DecisionThreshold[];
}

export const EXPERIMENT_01: Icp = {
  key: 'uk_private_dental',
  name: 'UK private dental practices selling implants and Invisalign',
  industry: 'dental',
  country: 'GB',
  cities: [
    'Manchester', 'Birmingham', 'Leeds', 'Bristol', 'Glasgow',
    'Liverpool', 'Sheffield', 'Nottingham', 'Edinburgh', 'Cardiff',
  ],

  why: [
    'One case is worth GBP 2,500-6,000 (implants, full-arch, Invisalign). A single '
    + 'recovered enquiry pays for a year of the monthly fee, so the ROI argument is '
    + 'arithmetic rather than a story I have to sell.',

    'The problem is visible from the public website, which is the thing this system is '
    + 'actually good at. No online booking for a consultation, a "we will get back to you '
    + 'within 24 hours" promise, a contact form as the only digital intake - all three are '
    + 'detected mechanically, so the email quotes their own page rather than a guess.',

    'High inbound volume with a hard bottleneck: self-pay patients shop around and enquire '
    + 'at several practices, while reception is one or two people who are also handling the '
    + 'front desk. Outside opening hours there is nobody at all.',

    'They can afford it. A private UK practice typically turns over GBP 500k-2M with a real '
    + 'marketing budget, so GBP 600-1,200/month sits inside an existing line item rather than '
    + 'needing a new one.',

    'The UK is the lowest-risk market in the mapped set for B2B cold email (PECR, registered '
    + 'companies, working opt-out), so the first experiment is not also a legal experiment.',

    'Healthcare deters generalist agencies - GDC advertising rules and clinical-advice risk '
    + 'mean less competition in the inbox than home services.',
  ],

  rejected: [
    {
      option: 'US home services (roofing, HVAC, solar)',
      reason: 'Job values are higher, but the inbox is saturated: a roofing contractor gets '
        + 'several of these emails a day. Winning there is an outbound-volume game, which is '
        + 'the opposite of what a one-person agency is good at.',
    },
    {
      option: 'US med spas',
      reason: 'Good economics, but most already run Podium, Weave or Boulevard. You would be '
        + 'selling a replacement for a tool they have already paid for, which is a much harder '
        + 'first conversation than selling into a gap.',
    },
    {
      option: 'Car repair / body shops (the current fixtures)',
      reason: 'Job value of GBP 200-500 cannot support GBP 1k+/month. They fail the price '
        + 'requirement outright, whatever the pain looks like.',
    },
    {
      option: 'UK recruitment agencies',
      reason: 'High placement fees, but their expensive problem is candidate sourcing, not '
        + 'lead response - and they already employ people to do it. Wrong problem for this agent.',
    },
    {
      option: 'Splitting 50 UK / 50 US',
      reason: 'At 100 leads and a plausible 5-10% reply rate you get 5-10 replies. Split across '
        + 'two markets that is 2-5 each, which cannot distinguish anything. One ICP, one market, '
        + 'one clean signal - then run the second market as experiment 02.',
    },
  ],

  problem:
    'A high-value enquiry (implant consultation, Invisalign) arrives through the website form '
    + 'on a Friday evening or a Saturday. Reception sees it on Monday morning. By then the '
    + 'patient has enquired at three other practices, and one of them replied within the hour.',

  evidence_expected: [
    'No online booking for a consultation, while the site pushes "book a consultation" as the CTA.',
    'A stated response promise ("within 24 hours", "next working day") that nothing enforces.',
    'Opening hours published alongside a phone number, with no out-of-hours path.',
    'A contact form as the only digital intake route.',
  ],

  agent_template: 'lead_response',

  offer: {
    build_gbp: [2000, 3000],
    monthly_gbp: [600, 1200],
    justification:
      'One implant case is worth GBP 2,500-4,000 in fees. If the agent recovers a single case '
      + 'per month that would otherwise have gone elsewhere, it returns 2-4x the monthly fee. '
      + 'That is the whole pitch, and it survives the client checking the arithmetic. Anchor '
      + 'the build against what one recovered case is worth, not against hours.',
  },

  thresholds: [
    {
      metric: 'Delivered (100% minus hard bounces)',
      pass_at: '>= 95%',
      if_below: 'A data problem, not an ICP problem. Stop and fix address verification before '
        + 'reading any other number - everything downstream is measured against a broken denominator.',
    },
    {
      metric: 'Reply rate (human replies, excluding auto-replies and bounces)',
      pass_at: '>= 6% (6+ of 100)',
      if_below: 'Between 2% and 5%: the copy or the sending domain, not the ICP. Change the '
        + 'subject line and opener and re-run before touching the target list. Below 2% with a '
        + 'clean bounce rate: the ICP itself is wrong.',
    },
    {
      metric: 'Positive reply rate (interested + booked)',
      pass_at: '>= 3% (3+ of 100)',
      if_below: 'If replies are healthy but positives are not, the ICP is right and the OFFER is '
        + 'wrong. Change the offer - price, scope, or the specific problem named - and keep the list.',
    },
    {
      metric: 'Booked calls',
      pass_at: '>= 2',
      if_below: 'Interest that never converts to a call usually means the ask is too large. Try '
        + 'offering the recorded walkthrough instead of a meeting.',
    },
    {
      metric: 'Unsubscribe rate',
      pass_at: '<= 2%',
      if_below: 'Above 2% the message reads as bulk regardless of how personalised it is. Rewrite '
        + 'the opener before sending another batch; this also protects the sending domain.',
    },
  ],
};

/** Read as: what a run of 100 has to produce to be worth continuing. */
export function decisionMatrix(): Array<{ signal: string; conclusion: string; action: string }> {
  return [
    {
      signal: 'reply >= 6% AND positive >= 3%',
      conclusion: 'ICP and offer both work.',
      action: 'Scale this ICP. Add the next two cities, keep everything else identical.',
    },
    {
      signal: 'reply >= 6% AND positive < 2%',
      conclusion: 'ICP works, offer does not.',
      action: 'Keep the list. Change the offer: different problem, different price, or lead with '
        + 'the walkthrough instead of the call.',
    },
    {
      signal: 'reply 2-5%',
      conclusion: 'Inconclusive - most likely copy or deliverability.',
      action: 'Re-run 100 more with a different subject and opener from the same ICP before '
        + 'concluding anything about the market.',
    },
    {
      signal: 'reply < 2% AND bounce < 5%',
      conclusion: 'The ICP is wrong.',
      action: 'Switch vertical. Next candidate: UK private cosmetic/aesthetic clinics, same agent.',
    },
    {
      signal: 'bounce > 5%',
      conclusion: 'Data quality, nothing else.',
      action: 'Do not read any other metric. Fix address verification and re-run.',
    },
    {
      signal: 'unsubscribe > 2%',
      conclusion: 'The message reads as bulk.',
      action: 'Stop sending. Rewrite the opener, and let the domain rest for a week.',
    },
  ];
}
