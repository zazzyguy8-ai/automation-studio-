import { NextResponse } from 'next/server';
import { getStore } from '@/lib/db';
import { runDailyCampaign } from '@/lib/engine/daily';
import { demoCompanies, demoSearchFetch, demoSiteFetcher } from '@/lib/engine/demo-fixtures';

export const maxDuration = 800;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const store = await getStore();
    let campaigns = (await store.listCampaigns()).filter((c) => c.status === 'active');

    if (campaigns.length === 0) {
      campaigns = [await store.insertCampaign({
        name: body.name ?? 'Manchester car repair',
        industry: body.industry ?? 'car repair',
        country: body.country ?? 'GB',
        city: body.city ?? 'Manchester',
        daily_target: Number(body.daily_target ?? 50),
        daily_send_cap: Number(body.daily_send_cap ?? 12),
        build_fee_eur: 1500, monthly_fee_eur: 300,
      outreach_mode: 'email', status: 'active',
      })];
    }

    const companies = demoCompanies(50);
    const runs = [];
    for (const campaign of campaigns) {
      runs.push(await runDailyCampaign(campaign, body.demo
        ? { searchFetch: demoSearchFetch(companies), siteFetcher: demoSiteFetcher(companies) }
        : {}));
    }
    return NextResponse.json({ runs: runs.map((r) => ({
      campaign: r.campaign.name,
      discovered: r.discovered,
      audited: r.audited,
      audit_rejected: r.audit_rejected,
      selected: r.selected.length,
      dropped: r.dropped.length,
      market_requires_ack: r.market_requires_ack,
    })) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
