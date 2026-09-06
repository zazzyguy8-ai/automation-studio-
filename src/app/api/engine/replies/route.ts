import { NextResponse } from 'next/server';
import { getStore } from '@/lib/db';
import { handleReply } from '@/lib/engine/replies';

/**
 * Records an inbound reply. In production this is the target of your mailbox
 * webhook; here it also lets you paste a reply in by hand, which is how you
 * would work an inbox before wiring one up.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body.mark_handled) {
      const store = await getStore();
      return NextResponse.json(await store.setReplyHandled(body.mark_handled, body.handled !== false));
    }
    if (!body.lead_id || !body.from_address || !body.body) {
      return NextResponse.json({ error: 'lead_id, from_address and body are required' }, { status: 400 });
    }
    return NextResponse.json(await handleReply({
      lead_id: body.lead_id,
      message_id: body.message_id ?? null,
      from_address: body.from_address,
      subject: body.subject ?? null,
      body: body.body,
    }));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
