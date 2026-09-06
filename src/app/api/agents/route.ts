import { NextResponse } from 'next/server';
import { getStore } from '@/lib/db';
import { createAgent } from '@/lib/blueprint/service';

export async function GET(req: Request) {
  const store = await getStore();
  const clientId = new URL(req.url).searchParams.get('client_id') ?? undefined;
  return NextResponse.json(await store.listAgents(clientId));
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    return NextResponse.json(await createAgent({
      client_id: body.client_id,
      template_key: body.template_key,
      name: body.name,
      sms_provider: body.sms_provider ?? 'telnyx',
    }));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
