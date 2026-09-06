import { NextResponse } from 'next/server';
import { setCredentialStatus } from '@/lib/blueprint/service';

/**
 * Records that a credential has been placed in the secret store.
 * It accepts an env var NAME and a status - never a value. A request
 * carrying anything that looks like a secret is refused outright.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    if ('value' in body || 'secret' in body || 'api_key' in body) {
      return NextResponse.json(
        { error: 'credential values are never accepted here - put it in the secret store and send only the name' },
        { status: 400 },
      );
    }
    return NextResponse.json(await setCredentialStatus(id, body.env_var, body.status));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
