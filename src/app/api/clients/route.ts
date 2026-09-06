import { NextResponse } from 'next/server';
import { getStore } from '@/lib/db';
import { convertLeadToClient } from '@/lib/blueprint/service';

export async function GET() {
  const store = await getStore();
  return NextResponse.json(await store.listClients());
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    return NextResponse.json(await convertLeadToClient({
      lead_id: body.lead_id,
      build_fee_eur: body.build_fee_eur ?? null,
      monthly_fee_eur: body.monthly_fee_eur ?? null,
    }));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
