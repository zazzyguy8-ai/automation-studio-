import { NextResponse } from 'next/server';
import { getStore } from '@/lib/db';

export async function GET() {
  const store = await getStore();
  return NextResponse.json(await store.listSuppressions());
}

export async function POST(req: Request) {
  try {
    const { value, scope, reason, note } = await req.json();
    if (!value) return NextResponse.json({ error: 'value is required' }, { status: 400 });
    const store = await getStore();
    return NextResponse.json(await store.addSuppression({
      value, scope: scope ?? 'address', reason: reason ?? 'manual', note: note ?? null,
    }));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
