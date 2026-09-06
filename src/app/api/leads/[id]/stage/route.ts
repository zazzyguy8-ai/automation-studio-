import { NextResponse } from 'next/server';
import { getStore } from '@/lib/db';
import { LEAD_STAGES, type LeadStage } from '@/lib/types';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { stage } = await req.json();
  if (!LEAD_STAGES.includes(stage)) {
    return NextResponse.json({ error: `unknown stage "${stage}"` }, { status: 400 });
  }
  const store = await getStore();
  return NextResponse.json(await store.setLeadStage(id, stage as LeadStage));
}
