import { NextResponse } from 'next/server';
import { runAudit } from '@/lib/audit/run';

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.website) return NextResponse.json({ error: 'website is required' }, { status: 400 });
    const run = await runAudit({
      website: String(body.website),
      company_name: body.company_name ?? undefined,
      industry: body.industry ?? null,
      country: body.country ?? null,
      source: body.source ?? 'ui',
    });
    return NextResponse.json(run);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
