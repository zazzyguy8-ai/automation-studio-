import { NextResponse } from 'next/server';
import { recordStepTest } from '@/lib/blueprint/service';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { step_key, passed } = await req.json();
    return NextResponse.json(await recordStepTest(id, step_key, Boolean(passed)));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
