/** Minimal HTML → text/links extraction. No parser dependency: the audit needs
 *  readable prose and hrefs, not a DOM. */

export function stripToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

export function extractTitle(html: string): string {
  return stripToText(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '').slice(0, 200);
}

export function extractLinks(html: string, baseUrl: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["']/gi)) {
    try {
      const url = new URL(m[1], baseUrl);
      if (url.protocol === 'http:' || url.protocol === 'https:') out.add(url.toString());
    } catch {
      /* malformed href — skip */
    }
  }
  return [...out];
}

/** Pages worth spending a fetch on, most valuable first. */
const PAGE_PRIORITY: Array<[RegExp, number]> = [
  [/contact|kontakt|kapcsolat/i, 10],
  [/book|booking|appointment|termin|rezerv|objedna/i, 10],
  [/service|sluzb|leistung|szolgalt|treatment|repair/i, 9],
  [/price|pricing|cennik|cenik|tarif|quote|offer/i, 8],
  [/about|o-nas|onas|ueber-uns|team/i, 6],
  [/faq|help|support/i, 5],
];

export function rankCandidatePages(links: string[], rootUrl: string): string[] {
  const root = new URL(rootUrl);
  const scored = new Map<string, number>();
  for (const link of links) {
    const url = new URL(link);
    if (url.hostname.replace(/^www\./, '') !== root.hostname.replace(/^www\./, '')) continue;
    if (/\.(pdf|jpe?g|png|gif|svg|webp|zip|mp4|docx?)$/i.test(url.pathname)) continue;
    const clean = `${url.origin}${url.pathname}`.replace(/\/$/, '') || url.origin;
    if (clean === (`${root.origin}${root.pathname}`.replace(/\/$/, '') || root.origin)) continue;
    let score = 1;
    for (const [re, weight] of PAGE_PRIORITY) if (re.test(url.pathname)) score = Math.max(score, weight);
    // Shallow pages beat deep ones at equal relevance.
    score -= (url.pathname.split('/').filter(Boolean).length - 1) * 0.1;
    scored.set(clean, Math.max(scored.get(clean) ?? 0, score));
  }
  return [...scored.entries()].sort((a, b) => b[1] - a[1]).map(([u]) => u);
}
