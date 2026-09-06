import { NextResponse } from 'next/server';
import { getStore } from '@/lib/db';
import { setKillSwitch } from '@/lib/engine/guards';

export async function POST(req: Request) {
  const { on, reason, limits } = await req.json();
  const store = await getStore();
  if (limits) {
    await store.updateEngineState({
      daily_send_cap: Number(limits.daily_send_cap),
      hourly_send_cap: Number(limits.hourly_send_cap),
      min_seconds_between_sends: Number(limits.min_seconds_between_sends),
      quiet_hours_start: Number(limits.quiet_hours_start),
      quiet_hours_end: Number(limits.quiet_hours_end),
    });
  }
  if (typeof on === 'boolean') return NextResponse.json(await setKillSwitch(on, reason ?? null));
  return NextResponse.json(await store.getEngineState());
}
