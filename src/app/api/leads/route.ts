import { NextResponse } from 'next/server';
import { getStore } from '@/lib/db';
import type { LeadStage } from '@/lib/types';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const store = await getStore();
  return NextResponse.json(await store.listLeads({
    q: url.searchParams.get('q') ?? undefined,
    stage: (url.searchParams.get('stage') as LeadStage) ?? undefined,
    industry: url.searchParams.get('industry') ?? undefined,
    country: url.searchParams.get('country') ?? undefined,
  }));
}

/** Bulk import: name + website (+ optional industry/country) per row.
 *  Enrichment happens when the lead is audited, not here. */
export async function POST(req: Request) {
  const body = await req.json();
  const rows: Array<Record<string, string>> = Array.isArray(body) ? body : body.leads ?? [];
  const store = await getStore();
  const out = [];
  for (const r of rows) {
    if (!r.website) continue;
    out.push(await store.upsertLead({
      company_name: r.company_name ?? r.name ?? r.website,
      website: r.website,
      industry: r.industry ?? null,
      country: r.country ?? null,
      size_hint: null,
      stage: 'new',
      contacts: [],
      socials: [],
      notes: r.notes ?? null,
      source: r.source ?? 'import',
    }));
  }
  return NextResponse.json({ imported: out.length, leads: out });
}
