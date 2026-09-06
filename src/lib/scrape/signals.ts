import type { Page, Snapshot } from '@/lib/types';

type Signals = Snapshot['signals'];

const BOOKING_VENDORS: Array<[string, RegExp]> = [
  ['Calendly', /calendly\.com/i],
  ['Cal.com', /\bcal\.com/i],
  ['Acuity', /acuity(scheduling)?\.com/i],
  ['SimplyBook', /simplybook\.(me|it)/i],
  ['Bookio', /bookio\.com/i],
  ['Reservio', /reservio\.com/i],
  ['Fresha', /fresha\.com/i],
  ['Setmore', /setmore\.com/i],
  ['Google Calendar Appointments', /calendar\.app\.google/i],
];

const CHAT_VENDORS = /intercom|crisp\.chat|tawk\.to|drift\.com|livechatinc|smartsupp|hubspot.*conversations|zendesk.*widget/i;

const CMS_HINTS: Array<[string, RegExp]> = [
  ['WordPress', /wp-content|wp-includes/i],
  ['Wix', /static\.wixstatic|wix\.com/i],
  ['Squarespace', /squarespace/i],
  ['Shopify', /cdn\.shopify/i],
  ['Webflow', /webflow\.(com|io)/i],
  ['HubSpot CMS', /hs-scripts\.com|hubspot/i],
];

const SOCIAL_PLATFORMS: Array<[string, RegExp]> = [
  ['facebook', /facebook\.com\/[A-Za-z0-9._-]+/i],
  ['instagram', /instagram\.com\/[A-Za-z0-9._-]+/i],
  ['linkedin', /linkedin\.com\/(company|in)\/[A-Za-z0-9._-]+/i],
  ['youtube', /youtube\.com\/(@|channel\/|c\/)[A-Za-z0-9._-]+/i],
  ['tiktok', /tiktok\.com\/@[A-Za-z0-9._-]+/i],
];

/** Sentences where a business promises a response time. These are the single
 *  most useful audit input: a stated promise is a measurable commitment. */
const RESPONSE_PROMISE =
  /[^.\n]*\b(within|during|reply|respond|response|get back to you|call you back|24\s*(h|hours)|48\s*(h|hours)|business days?|working days?|do\s*24\s*hod|ozveme|odpovieme|antworten)\b[^.\n]*/gi;

const PHONE = /(?:\+\d{1,3}[\s./-]?)?(?:\(?\d{2,4}\)?[\s./-]?){2,4}\d{2,4}/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Everything here is derived mechanically from the fetched HTML, so anything
 *  built on it can honestly be labelled `observed`. */
export function detectSignals(pages: Page[], rawHtml: string[]): Signals {
  const html = rawHtml.join('\n');
  const text = pages.map((p) => p.text).join('\n');

  const phones = [...new Set([...text.matchAll(PHONE)]
    .map((m) => m[0].trim())
    .filter((p) => p.replace(/\D/g, '').length >= 9 && p.replace(/\D/g, '').length <= 15))]
    .slice(0, 5);

  const emails = [...new Set([...text.matchAll(EMAIL)].map((m) => m[0].toLowerCase()))]
    .filter((e) => !/\.(png|jpg|jpeg|gif|webp)$/.test(e))
    .slice(0, 5);

  const socials: Signals['social_links'] = [];
  for (const [platform, re] of SOCIAL_PLATFORMS) {
    const m = re.exec(html);
    if (m) socials.push({ platform, url: m[0].startsWith('http') ? m[0] : `https://${m[0]}` });
  }

  const promises = [...new Set([...text.matchAll(RESPONSE_PROMISE)]
    .map((m) => m[0].trim().replace(/\s+/g, ' '))
    .filter((s) => s.length > 20 && s.length < 220))].slice(0, 6);

  return {
    has_contact_form: /<form\b/i.test(html) && /(name|email|message|meno|sprava)/i.test(html),
    has_online_booking: BOOKING_VENDORS.some(([, re]) => re.test(html))
      || /\b(book now|book online|schedule (a |an )?(call|appointment)|objednat|rezervovat)\b/i.test(text),
    has_live_chat: CHAT_VENDORS.test(html),
    has_pricing_page: pages.some((p) => /price|pricing|cennik|cenik|tarif/i.test(p.url))
      || /\b(from|od)\s*[€$£]\s*\d/i.test(text),
    phone_numbers: phones,
    emails,
    social_links: socials,
    response_promises: promises,
    booking_vendors: BOOKING_VENDORS.filter(([, re]) => re.test(html)).map(([name]) => name),
    cms_hints: CMS_HINTS.filter(([, re]) => re.test(html)).map(([name]) => name),
  };
}
