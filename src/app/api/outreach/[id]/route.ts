import { NextResponse } from 'next/server';
import { getStore } from '@/lib/db';
import { approveOutreachForLead } from '@/lib/outreach/build';

/** Approve or reject one draft. Sending is deliberately NOT wired to a
 *  provider here: the MVP hands you approved copy to send yourself. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { lead_id, action } = await req.json();
    const store = await getStore();
    if (action === 'reject') return NextResponse.json(await store.setOutreachStatus(id, 'rejected'));
    if (action === 'mark_sent') {
      const msg = (await store.listOutreach(lead_id)).find((m) => m.id === id);
      if (msg?.status !== 'approved') {
        return NextResponse.json({ error: 'approve the message before marking it sent' }, { status: 409 });
      }
      return NextResponse.json(await store.setOutreachStatus(id, 'sent'));
    }
    return NextResponse.json(await approveOutreachForLead(lead_id, id));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 409 });
  }
}
