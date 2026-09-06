import type { Snapshot } from '@/lib/types';
import { templateCatalogueForPrompt } from '@/lib/blueprint/templates';

export function siteDigest(snapshot: Snapshot, budgetChars = 24_000): string {
  const perPage = Math.floor(budgetChars / Math.max(snapshot.pages.length, 1));
  const pages = snapshot.pages
    .map((p) => `### ${p.title || p.url}\nURL: ${p.url}\n${p.text.slice(0, perPage)}`)
    .join('\n\n');
  const s = snapshot.signals;
  const observed = [
    `contact form present: ${s.has_contact_form}`,
    `online booking present: ${s.has_online_booking}${s.booking_vendors.length ? ` (${s.booking_vendors.join(', ')})` : ''}`,
    `live chat present: ${s.has_live_chat}`,
    `public pricing present: ${s.has_pricing_page}`,
    `phone numbers found: ${s.phone_numbers.join(', ') || 'none'}`,
    `emails found: ${s.emails.join(', ') || 'none'}`,
    `social profiles: ${s.social_links.map((l) => l.platform).join(', ') || 'none'}`,
    `stated response promises: ${s.response_promises.length ? s.response_promises.map((p) => `"${p}"`).join(' | ') : 'none found'}`,
  ].join('\n');
  return `## Mechanically observed signals (verified, not inferred)\n${observed}\n\n## Public site content\n${pages}`;
}

export const AUDIT_SYSTEM = `You are a senior automation consultant auditing a small or mid-sized business from its public website, on behalf of a one-person AI automation agency.

Your output is used to sell a €1,000–€3,000 build plus €200–€1,000/month management. It has to be good enough that the business owner reads it and thinks "this person actually looked at my business".

HARD RULES:
1. Every problem you name MUST be supported by a verbatim quote from the supplied site content, with the URL it came from. If you cannot quote it, you cannot claim it.
2. Never propose a vague capability. "Use an AI chatbot", "leverage AI to improve efficiency", "implement automation" are all rejected outputs. Every opportunity must be an explicit ordered workflow of at least 4 steps naming trigger, channel, and integration at each step — for example:
   web form submitted -> SMS within 60s -> AI asks 4 qualification questions -> writes to CRM -> offers 3 real calendar slots -> follow-up at +1h/+24h/+72h -> human handoff on complaint.
3. Every opportunity must map to exactly one template_key from the catalogue below. Do not invent template keys.
4. Distinguish what you OBSERVED from what you INFERRED. Do not state inferences as facts, and never state a number as a measurement of this business. You have no access to their traffic, call volume, revenue or CRM.
5. Do not claim the business is doing something badly if the site shows they already do it. If they have online booking, do not propose online booking.
6. Score ROI, effort and urgency each 1-10, with a one-sentence rationale that refers to this specific business.
7. Propose 3 to 5 opportunities and recommend exactly one, explaining why it beats the others for THIS business.

Write in plain, concrete language. No marketing adjectives.

## Agent template catalogue
${templateCatalogueForPrompt()}`;

export function auditUserPrompt(companyName: string, website: string, industry: string | null, country: string | null, digest: string): string {
  return `Company: ${companyName}
Website: ${website}
Industry (as recorded by the operator, may be wrong): ${industry ?? 'unknown'}
Country: ${country ?? 'unknown'}

${digest}

Produce the audit as JSON matching the provided schema. Ground every problem in a quote from the content above.`;
}

export const COPY_SYSTEM = `You write first-contact outreach for a one-person AI automation agency.

HARD RULES:
1. Every message must reference something specific and verifiable from the audit of THIS business — a quote from their site, a page they have, a gap you can point at. If a sentence would read the same for any other company, delete it.
2. No fabricated numbers. You may say "based on typical response-time data this is usually worth X" only if you mark it as an estimate. You may never say "you are losing 30 leads a month" as if measured.
3. No flattery openers ("I love what you're doing"), no "quick question", no "hope this finds you well".
4. Short. Email under 130 words. DM under 60 words. One ask.
5. The ask is a reply or a short call — never a hard sell.
6. Sign as a real person and include how to say no.

Return the message plus a "grounding" list: the specific audit facts the message used.`;
