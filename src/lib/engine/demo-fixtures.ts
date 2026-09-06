import type { Fetcher } from '@/lib/scrape/crawl';

/**
 * 50 fictional companies, generated deterministically, for exercising the
 * engine end to end.
 *
 * These are NOT real businesses and the domains are all `.example`, which is
 * reserved by RFC 2606 and can never resolve. The variety is deliberate: some
 * have an email on the site, some only in the directory, some have neither,
 * some already run online booking, and a few sites are unreachable. A run that
 * only ever sees the happy path proves nothing.
 */

export interface DemoCompany {
  name: string;
  domain: string;
  city: string;
  osmId: number;
  /** Shapes the generated site, and therefore what the audit finds. */
  profile: 'phone_first' | 'form_promise' | 'quote_heavy' | 'has_booking' | 'thin';
  /** Contactability, which is what the ranking cares about most. */
  contact: 'email_on_site' | 'directory_only' | 'none';
  reachable: boolean;
}

const TOWNS = ['Manchester', 'Salford', 'Stockport', 'Bolton', 'Oldham'];
const PREFIX = [
  'Northgate', 'Quay Street', 'Ancoats', 'Deansgate', 'Trafford', 'Eccles', 'Didsbury',
  'Chorlton', 'Prestwich', 'Rusholme', 'Hulme', 'Openshaw', 'Gorton', 'Levenshulme',
  'Withington', 'Cheetham', 'Failsworth', 'Swinton', 'Worsley', 'Urmston', 'Sale',
  'Altrincham', 'Bury', 'Radcliffe', 'Whitefield',
];
const SUFFIX = ['Auto Repairs', 'Motor Works'];

const PROFILES: DemoCompany['profile'][] = ['phone_first', 'form_promise', 'quote_heavy', 'has_booking', 'thin'];
const CONTACTS: DemoCompany['contact'][] = ['email_on_site', 'email_on_site', 'directory_only', 'none'];

/** Deterministic, so a failing run can be reproduced exactly. */
export function demoCompanies(count = 50): DemoCompany[] {
  const out: DemoCompany[] = [];
  for (let i = 0; i < count; i += 1) {
    const prefix = PREFIX[i % PREFIX.length];
    const suffix = SUFFIX[Math.floor(i / PREFIX.length) % SUFFIX.length];
    const name = `${prefix} ${suffix}`;
    out.push({
      name,
      domain: `${prefix.toLowerCase().replace(/[^a-z]/g, '')}-${suffix.split(' ')[0].toLowerCase()}.example`,
      city: TOWNS[i % TOWNS.length],
      osmId: 20_000 + i,
      // Weighted so the common cases dominate but the awkward ones still appear.
      profile: PROFILES[i % PROFILES.length],
      contact: CONTACTS[i % CONTACTS.length],
      // Every 11th site is down, which is roughly what real lists look like.
      reachable: i % 11 !== 10,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Generated sites                                                     */
/* ------------------------------------------------------------------ */

function siteHtml(c: DemoCompany, path: string): string {
  const email = `bookings@${c.domain}`;
  const phone = `0161 ${496 + (c.osmId % 400)} ${1000 + (c.osmId % 8999)}`;
  const emailLine = c.contact === 'email_on_site'
    ? `<p>Or email photographs of the damage to ${email} and we will prepare a written estimate.</p>`
    : '';

  const shared = `<footer>${c.contact === 'email_on_site' ? `${email} | ` : ''}${phone} | ${c.city}</footer>`;

  if (path === 'contact') {
    return `<!doctype html><html lang="en"><head><title>Contact | ${c.name}</title></head><body>
<h1>Contact ${c.name}</h1>
<p>${c.name}, ${c.city}</p>
<p>Telephone: ${phone} — please call during opening hours; outside them the phone is unattended.</p>
${emailLine}
<form action="/enquiry" method="post"><input name="name"><input name="email"><textarea name="message"></textarea><button>Send</button></form>
${shared}</body></html>`;
  }

  if (path === 'services') {
    return `<!doctype html><html lang="en"><head><title>Services | ${c.name}</title></head><body>
<h1>Garage services</h1>
<p>Accident repair including all the paperwork with your insurer. We handle the claim on your behalf.</p>
<p>Bodywork and paint in our own low-bake oven, colour matched. Panels from GBP 180.</p>
${c.profile === 'quote_heavy'
    ? '<p>If you need a written estimate, email us photographs of the damage and we will prepare a quote within two working days.</p>'
    : '<p>Servicing: oil and filters, brakes, cambelts.</p>'}
${shared}</body></html>`;
  }

  const intro = {
    phone_first:
      `<h2>Need a repair? Give us a ring</h2>
<p>The quickest way to reach us is by phone on ${phone}. Call and we will book you in for an inspection.</p>`,
    form_promise:
      `<h2>Get in touch</h2>
<p>Fill in the form and we will get back to you within 24 hours on working days.</p>`,
    quote_heavy:
      `<h2>Request an estimate</h2>
<p>Send us photographs of the damage and we will prepare a written quote within two working days.</p>`,
    has_booking:
      `<h2>Book online</h2>
<p><a href="https://calendly.com/${c.domain.split('.')[0]}/mot">Book your slot online</a> — confirmed instantly.</p>`,
    thin: '<h2>Coming soon</h2>',
  }[c.profile];

  if (c.profile === 'thin') {
    return `<!doctype html><html lang="en"><head><title>${c.name}</title></head><body><h1>${c.name}</h1>${intro}</body></html>`;
  }

  return `<!doctype html><html lang="en"><head><title>${c.name} | MOT, servicing and bodywork in ${c.city}</title></head>
<body>
<nav><a href="/services">Services</a> <a href="/contact">Contact</a></nav>
<h1>${c.name} — independent garage in ${c.city}</h1>
<p>We are a family-run garage with eight technicians, four ramps and our own bodyshop.</p>
${intro}
<p>Opening hours: Monday to Friday 8:00 - 17:30, Saturday 8:00 - 12:00. We are closed on Sundays.</p>
<h2>What we do</h2>
<ul><li>MOT testing and preparation</li><li>Servicing and diagnostics</li><li>Accident repair and bodywork</li>
<li>Clutch and gearbox work</li><li>Air conditioning regas</li><li>Insurance work and courtesy cars</li></ul>
<h2>Get in touch</h2>
<p>Fill in the form and we will get back to you within 24 hours on working days.</p>
<form action="/enquiry" method="post">
<input name="name" placeholder="Your name"><input name="email" placeholder="Email"><input name="phone" placeholder="Phone">
<textarea name="message" placeholder="Tell us what is wrong with the vehicle"></textarea><button>Send enquiry</button></form>
${emailLine}
<h2>What our customers say</h2>
<p>We look after more than 400 vehicles a year. Reviews are on our Google listing.</p>
${shared}</body></html>`;
}

/** Serves the generated sites; unreachable ones return a hard failure. */
export function demoSiteFetcher(companies: DemoCompany[]): Fetcher {
  const byHost = new Map(companies.map((c) => [c.domain, c]));
  return async (url: string) => {
    const parsed = new URL(url);
    const company = byHost.get(parsed.hostname.replace(/^www\./, ''));
    if (!company) return { status: 404, html: '' };
    if (!company.reachable) return { status: 403, html: '' };
    const path = parsed.pathname.replace(/^\/|\/$/g, '');
    if (path && !['contact', 'services'].includes(path)) return { status: 404, html: '' };
    return { status: 200, html: siteHtml(company, path) };
  };
}

/** Serves Nominatim and Overpass responses covering all 50 companies. */
export function demoSearchFetch(companies: DemoCompany[]): typeof fetch {
  const nominatim = JSON.stringify([{
    place_id: 1, osm_type: 'relation', osm_id: 88123,
    display_name: 'Manchester, Greater Manchester, England, United Kingdom',
  }]);

  const overpass = JSON.stringify({
    version: 0.6,
    elements: companies.map((c) => ({
      type: 'node',
      id: c.osmId,
      tags: {
        name: c.name,
        shop: 'car_repair',
        website: `https://${c.domain}`,
        'addr:city': c.city,
        // Only directory_only companies carry an email in OSM; that is the
        // case where the address exists but is not confirmed on the site.
        ...(c.contact === 'directory_only' ? { email: `office@${c.domain}` } : {}),
        phone: `0161 ${496 + (c.osmId % 400)} ${1000 + (c.osmId % 8999)}`,
      },
    })),
  });

  return (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const body = url.includes('nominatim') ? nominatim : url.includes('overpass') ? overpass : null;
    if (!body) return new Response('not found', { status: 404 });
    return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
}
