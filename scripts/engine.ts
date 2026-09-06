/**
 * Outreach engine from the terminal.
 *
 *   npm run engine -- daily --demo          # find, audit, draft into the inbox
 *   npm run engine -- send                  # send what you have approved
 *   npm run engine -- status                # dashboard
 *   npm run engine -- stop "reason"         # kill switch on
 *   npm run engine -- start                 # kill switch off
 *
 * `daily` and `send` are the two things you would put on a schedule. Sending is
 * a dry run unless RESEND_API_KEY is set AND OUTREACH_SENDING_ENABLED=true.
 */
import { getStore } from '@/lib/db';
import { engineDashboard } from '@/lib/engine/dashboard';
import { runDailyCampaign } from '@/lib/engine/daily';
import { demoCompanies, demoSearchFetch, demoSiteFetcher } from '@/lib/engine/demo-fixtures';
import { setKillSwitch } from '@/lib/engine/guards';
import { runSendQueue } from '@/lib/engine/send';

const h1 = (s: string) => console.log(`\n\x1b[1m${s}\x1b[0m\n${'-'.repeat(s.length)}`);
const arg = (flag: string) => {
  const i = process.argv.indexOf(flag);
  const v = i === -1 ? undefined : process.argv[i + 1];
  return v && !v.startsWith('--') ? v : undefined;
};

async function daily() {
  const store = await getStore();
  const demo = process.argv.includes('--demo');
  let campaigns = (await store.listCampaigns()).filter((c) => c.status === 'active');

  if (campaigns.length === 0) {
    const created = await store.insertCampaign({
      name: arg('--name') ?? 'Manchester car repair',
      industry: arg('--industry') ?? 'car repair',
      country: arg('--country') ?? 'GB',
      city: arg('--city') ?? 'Manchester',
      daily_target: Number(arg('--target') ?? 50),
      daily_send_cap: Number(arg('--cap') ?? 12),
      build_fee_eur: 1500, monthly_fee_eur: 300, status: 'active',
    });
    console.log(`Created campaign "${created.name}".`);
    campaigns = [created];
  }

  const companies = demoCompanies(50);
  for (const campaign of campaigns) {
    h1(`${campaign.name} (${campaign.industry}, ${campaign.city ?? campaign.country})`);
    const run = await runDailyCampaign(campaign, demo
      ? { searchFetch: demoSearchFetch(companies), siteFetcher: demoSiteFetcher(companies) }
      : {});

    console.log(`discovered ${run.discovered} · saved ${run.saved_leads} · audited ${run.audited} `
      + `· audit rejected ${run.audit_rejected} · selected ${run.selected.length}`);
    if (run.market_requires_ack) {
      console.log(`\nHIGH-RISK MARKET: ${run.market_note}`);
    }

    h1('DRAFTED FOR YOUR APPROVAL');
    for (const s of run.selected) {
      const first = s.drafts.find((d) => d.step === 0);
      console.log(`\n  [${s.score}] ${s.lead.company_name}  ${s.lead.website}`);
      console.log(`    sell: ${s.opportunity.title}`);
      console.log(`    to:   ${s.lead.contacts.find((c) => c.kind === 'email')?.value ?? 'NO EMAIL'}`);
      console.log(`    subj: ${first?.subject ?? '-'}`);
      console.log(`    approve at /engine`);
    }
    console.log(`\n${run.dropped.length} dropped. Nothing has been sent.`);
  }
}

async function send() {
  const run = await runSendQueue({ limit: Number(arg('--limit') ?? 50) });
  h1(`SEND RUN (${run.dry_run ? 'DRY RUN - nothing left this machine' : `live via ${run.adapter}`})`);
  console.log(`attempted ${run.attempted} · sent ${run.sent}`);
  if (run.halted) console.log(`halted: ${run.halted.code} — ${run.halted.reason}`);
  for (const s of run.skipped) console.log(`  skipped ${s.message_id.slice(0, 8)}: ${s.code} — ${s.reason}`);
  if (run.dry_run) {
    console.log('\nTo send for real: set RESEND_API_KEY and OUTREACH_SENDING_ENABLED=true in .env.local.');
  }
}

async function status() {
  const d = await engineDashboard();
  h1('ENGINE');
  console.log(`sending: ${d.can_send_now ? 'ON' : `BLOCKED — ${d.send_blocked_reason}`}`);
  console.log(`today: ${d.engine.sent_today}/${d.engine.daily_send_cap} · hourly cap ${d.engine.hourly_send_cap}`
    + ` · min gap ${d.engine.min_seconds_between_sends}s · quiet ${d.engine.quiet_hours_start}:00-${d.engine.quiet_hours_end}:00`);

  h1('LEADS');
  for (const [stage, n] of Object.entries(d.leads.by_stage)) {
    if (n > 0) console.log(`  ${stage.padEnd(10)} ${n}`);
  }

  h1('MESSAGES');
  console.log(`  awaiting approval ${d.messages.awaiting_approval}`);
  console.log(`  approved, unsent  ${d.messages.approved_not_sent}`);
  console.log(`  follow-ups queued ${d.messages.scheduled_follow_ups}`);
  console.log(`  sent              ${d.messages.sent}`);
  console.log(`  cancelled         ${d.messages.cancelled}`);
  console.log(`  suppressed        ${d.messages.suppressed}`);
  console.log(`  failed            ${d.messages.failed}`);

  h1('REPLIES');
  console.log(`  total ${d.replies.total} (${d.replies.unhandled} unread)`);
  console.log(`  positive ${d.replies.positive} · booked ${d.replies.booked} · negative ${d.replies.negative}`);
  console.log(`  unsubscribes ${d.replies.unsubscribe} · bounces ${d.replies.bounce}`);
  console.log(`  reply rate ${d.replies.reply_rate_pct ?? '-'}% · positive rate ${d.replies.positive_rate_pct ?? '-'}%`);
  console.log(`  suppression list: ${d.suppression_count}`);
}

async function main() {
  const command = process.argv[2];
  switch (command) {
    case 'daily': return daily();
    case 'send': return send();
    case 'status': return status();
    case 'stop': {
      const state = await setKillSwitch(true, process.argv[3] ?? 'stopped from the CLI');
      console.log(`Kill switch ON: ${state.kill_switch_reason}. Nothing will send.`);
      return;
    }
    case 'start': {
      await setKillSwitch(false);
      console.log('Kill switch OFF. Approved messages will send on the next run.');
      return;
    }
    default:
      console.error('usage: npm run engine -- <daily|send|status|stop|start> [--demo]');
      process.exit(2);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
