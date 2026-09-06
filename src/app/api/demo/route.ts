import { NextResponse } from 'next/server';
import { getStore } from '@/lib/db';
import { buildDemo } from '@/lib/demo/build';

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const { lead_id, overrides } = await req.json();
    const store = await getStore();
    const lead = await store.getLead(lead_id);
    const audit = await store.latestAudit(lead_id);
    if (!lead || !audit) return NextResponse.json({ error: 'lead or audit not found' }, { status: 404 });
    return NextResponse.json(await buildDemo(lead, audit, overrides ?? {}));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
