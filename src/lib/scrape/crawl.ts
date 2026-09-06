import type { Contact, Page, Snapshot } from '@/lib/types';
import { extractLinks, extractTitle, rankCandidatePages, stripToText } from './html';
import { detectSignals } from './signals';

export type Fetcher = (url: string) => Promise<{ status: number; html: string }>;

/** The root page could not be read. Distinct from "the page was read and had
 *  little on it" - a 403 from bot protection or a proxy must never be reported
 *  to the operator as an empty business website. */
export class CrawlError extends Error {
  constructor(message: string, readonly status: number, readonly url: string) {
    super(message);
    this.name = 'CrawlError';
  }
}

export interface CrawlOptions {
  maxPages?: number;
  timeoutMs?: number;
  fetcher?: Fetcher;
}

const defaultFetcher: Fetcher = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.CRAWL_TIMEOUT_MS ?? 12000));
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent': process.env.CRAWL_USER_AGENT ?? 'AutomationStudioBot/0.1 (+audit)',
        accept: 'text/html,application/xhtml+xml',
      },
    });
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('html')) return { status: res.status, html: '' };
    return { status: res.status, html: (await res.text()).slice(0, 400_000) };
  } finally {
    clearTimeout(timeout);
  }
};

export function normalizeUrl(input: string): string {
  const withScheme = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  const url = new URL(withScheme);
  url.hash = '';
  return url.toString().replace(/\/$/, '') || url.origin;
}

/** Fetch the public site and reduce it to text + mechanically observed signals.
 *  Only public pages, one polite pass, hard page cap. */
export async function crawlSite(
  rootUrlInput: string,
  opts: CrawlOptions = {},
): Promise<Omit<Snapshot, 'id' | 'lead_id'>> {
  const rootUrl = normalizeUrl(rootUrlInput);
  const maxPages = opts.maxPages ?? Number(process.env.CRAWL_MAX_PAGES ?? 8);
  const fetcher = opts.fetcher ?? defaultFetcher;

  const pages: Page[] = [];
  const rawHtml: string[] = [];

  const root = await fetcher(rootUrl);
  // Fail loudly here. Everything downstream treats an empty page as "this
  // business publishes nothing", which is a very different claim from "we were
  // not allowed to read it".
  if (root.status < 200 || root.status >= 300) {
    throw new CrawlError(`${rootUrl} returned HTTP ${root.status}`, root.status, rootUrl);
  }
  if (root.html.trim().length === 0) {
    throw new CrawlError(`${rootUrl} returned an empty response body`, root.status, rootUrl);
  }
  rawHtml.push(root.html);
  pages.push({
    url: rootUrl,
    title: extractTitle(root.html),
    text: stripToText(root.html).slice(0, 12_000),
    status: root.status,
  });

  const candidates = rankCandidatePages(extractLinks(root.html, rootUrl), rootUrl).slice(0, maxPages - 1);
  for (const url of candidates) {
    try {
      const res = await fetcher(url);
      if (!res.html) continue;
      rawHtml.push(res.html);
      pages.push({
        url,
        title: extractTitle(res.html),
        text: stripToText(res.html).slice(0, 8_000),
        status: res.status,
      });
    } catch {
      /* a dead subpage must not fail the audit */
    }
  }

  return {
    root_url: rootUrl,
    pages,
    signals: detectSignals(pages, rawHtml),
    fetched_at: new Date().toISOString(),
  };
}

/** Contacts, straight from the observed signals — no inference.
 *  These were read off the company's own pages, so they carry the strongest
 *  verification label discovery uses. */
export function contactsFromSnapshot(signals: Snapshot['signals'], rootUrl?: string): Contact[] {
  const found = (kind: Contact['kind'], value: string): Contact => ({
    kind, value, label: 'found_on_site', source_url: rootUrl,
  });
  const contacts: Contact[] = [
    ...signals.emails.map((v) => found('email', v)),
    ...signals.phone_numbers.map((v) => found('phone', v)),
  ];
  if (signals.has_contact_form) contacts.push(found('form', 'website contact form'));
  return contacts;
}

/**
 * Merges freshly crawled contacts with what is already on the lead.
 *
 * The audit re-crawls a site that discovery already verified, and simply
 * assigning the new list dropped discovery's verification labels - which the
 * ranking and the send gate both depend on. Existing entries win on their
 * label; genuinely new finds are appended.
 */
export function mergeContacts(existing: Contact[], fresh: Contact[]): Contact[] {
  const key = (c: Contact) => `${c.kind}:${c.value.trim().toLowerCase()}`;
  const merged = new Map<string, Contact>();
  for (const c of fresh) merged.set(key(c), c);
  for (const c of existing) {
    const k = key(c);
    const incoming = merged.get(k);
    // Keep the stronger of the two labels rather than whichever ran last.
    merged.set(k, incoming && c.label !== 'found_on_site' ? incoming : c);
  }
  return [...merged.values()];
}

/** Coarse size hint from what the site shows. Deliberately a hint, not a claim. */
export function sizeHint(snapshot: Omit<Snapshot, 'id' | 'lead_id'>): string {
  const text = snapshot.pages.map((p) => p.text).join(' ');
  const teamMentions = (text.match(/\b(our team|team of|employees|staff|zamestnan|kolektiv)\b/gi) ?? []).length;
  const locations = (text.match(/\b(branch|location|pobocka|filial)\b/gi) ?? []).length;
  if (locations >= 3) return 'multi-location (site mentions several branches)';
  if (teamMentions >= 2) return 'small team (site references a team)';
  return 'unknown (not stated on site)';
}
