import { NextResponse } from 'next/server';
import { getStore } from '@/lib/db';
import { toN8nWorkflow } from '@/lib/blueprint/n8n-export';

/** Downloadable n8n workflow scaffold. Contains credential names, never values. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const store = await getStore();
  const agent = await store.getAgent(id);
  if (!agent) return NextResponse.json({ error: 'agent not found' }, { status: 404 });
  const client = await store.getClient(agent.client_id);
  const workflow = toN8nWorkflow(agent.blueprint, client?.name ?? 'client');
  return new NextResponse(JSON.stringify(workflow, null, 2), {
    headers: {
      'content-type': 'application/json',
      'content-disposition': `attachment; filename="${agent.template_key}-n8n.json"`,
    },
  });
}
