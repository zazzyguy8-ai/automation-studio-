import { NextResponse } from 'next/server';
import { getStore } from '@/lib/db';
import { buildOutreachSequence } from '@/lib/outreach/build';
import type { Channel } from '@/lib/types';

export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const { lead_id, channel, steps } = await req.json();
    const store = await getStore();
    const lead = await store.getLead(lead_id);
    const audit = await store.latestAudit(lead_id);
    const demo = await store.latestDemo(lead_id);
    if (!lead || !audit) return NextResponse.json({ error: 'lead or audit not found' }, { status: 404 });
    if (!demo) return NextResponse.json({ error: 'build the demo first - outreach quotes its estimates' }, { status: 409 });
    return NextResponse.json(
      await buildOutreachSequence(lead, audit, demo, (channel ?? 'email') as Channel, steps ?? 3),
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
