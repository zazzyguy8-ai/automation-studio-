import { NextResponse } from 'next/server';
import { runSendQueue } from '@/lib/engine/send';

export const maxDuration = 300;

export async function POST() {
  try {
    return NextResponse.json(await runSendQueue({ limit: 50 }));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
