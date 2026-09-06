import { NextResponse } from 'next/server';
import { runDiscovery } from '@/lib/discovery/run';
import { fixtureSearchFetch, fixtureSiteFetcher } from '@/lib/discovery/fixture-transport';

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.industry || !body.country) {
      return NextResponse.json({ error: 'industry a country sú povinné' }, { status: 400 });
    }
    const offline = Boolean(body.offline);
    const run = await runDiscovery(
      {
        industry: String(body.industry),
        country: String(body.country),
        city: body.city ? String(body.city) : null,
        limit: Math.min(Number(body.limit ?? 15), 50),
        requireWebsite: true,
      },
      {
        provider: body.provider ?? 'auto',
        verify: body.verify !== false,
        ...(offline ? { searchFetch: fixtureSearchFetch(), siteFetcher: fixtureSiteFetcher() } : {}),
      },
    );
    return NextResponse.json(run);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
