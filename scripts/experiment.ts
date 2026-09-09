/**
 * Experiment 01: 100 real leads for one ICP, into the approval inbox.
 *
 *   npm run experiment -- --run          # live: real companies, real websites
 *   npm run experiment -- --run --demo   # offline rehearsal on generated data
 *   npm run experiment -- --report       # ICP, offer and decision thresholds
 *   npm run experiment -- --status       # how the running experiment is doing
 *
 * Nothing is sent. The run fills the approval inbox and stops.
 *
 * Live mode needs outbound network access to Nominatim, Overpass and the
 * prospects' own websites, plus ANTHROPIC_API_KEY for audits worth sending.
 */
import { getStore } from '@/lib/db';
import { runDailyCampaign } from '@/lib/engine/daily';
import { engineDashboard } from '@/lib/engine/dashboard';
import { demoCompanies, demoSearchFetch, demoSiteFetcher } from '@/lib/engine/demo-fixtures';
import { EXPERIMENT_01, decisionMatrix } from '@/lib/engine/icp';
import { activeProvider } from '@/lib/pipeline/run';
import type { Campaign } from '@/lib/types';

const TARGET = 100;

const h1 = (s: string) => console.log(`\n\x1b[1m${s}\x1b[0m\n${'='.repeat(Math.min(s.length, 76))}`);
const h2 = (s: string) => console.log(`\n${s}\n${'-'.repeat(Math.min(s.length, 76))}`);
const wrap = (s: string, indent = '  ') =>
  s.replace(/(.{1,74})(\s|$)/g, `${indent}$1\n`).trimEnd();

function report() {
  const icp = EXPERIMENT_01;
  h1(`EXPERIMENT 01 — ${icp.name}`);

  h2('WHY THIS ICP');
  for (const [i, r] of icp.why.entries()) console.log(`${i + 1}.\n${wrap(r)}\n`);

  h2('WHAT WAS REJECTED, AND WHY');
  for (const r of icp.rejected) {
    console.log(`  ${r.option}`);
    console.log(`${wrap(r.reason, '    ')}\n`);
  }

  h2('THE PROBLEM WE SELL AGAINST');
  console.log(wrap(icp.problem));
  console.log('\n  What the audit should find on their own site:');
  for (const e of icp.evidence_expected) console.log(`    - ${e}`);

  h2('THE AGENT WE BUILD');
  console.log(`  Template: ${icp.agent_template} (Lead Response + Qualification)`);
  console.log('    trigger  website form / missed call enters the workflow within seconds');
  console.log('    system   SMS + email inside 60s, naming the treatment they asked about');
  console.log('    ai       four qualification questions: treatment, urgency, self-pay, timing');
  console.log('    system   writes the qualified enquiry into the practice system');
  console.log('    system   offers three real consultation slots from the live diary');
  console.log('    system   follow-up ladder at +1h / +24h / +72h, cancelled by any reply');
  console.log('    human    any clinical question or pain mention hands off immediately');
  console.log('\n  The clinical handoff is not optional: the agent must never answer a');
  console.log('  clinical question. That is both a GDC problem and the fastest way to');
  console.log('  lose the client.');

  h2('PRICE');
  console.log(`  Build:   GBP ${icp.offer.build_gbp[0]}-${icp.offer.build_gbp[1]}`);
  console.log(`  Monthly: GBP ${icp.offer.monthly_gbp[0]}-${icp.offer.monthly_gbp[1]}`);
  console.log(`\n${wrap(icp.offer.justification)}`);

  h2(`DECISION THRESHOLDS AFTER ${TARGET} LEADS`);
  for (const t of icp.thresholds) {
    console.log(`  ${t.metric}`);
    console.log(`    pass at ${t.pass_at}`);
    console.log(`${wrap(t.if_below, '    ')}\n`);
  }

  h2('DECISION MATRIX');
  for (const row of decisionMatrix()) {
    console.log(`  ${row.signal}`);
    console.log(`    -> ${row.conclusion}`);
    console.log(`${wrap(row.action, '       ')}\n`);
  }

  h2('BEFORE YOU SEND ANY OF THIS');
  console.log(wrap(
    'A hundred emails out of a cold domain is how you burn the domain, not how you '
    + 'run an experiment. Warm up first: SPF, DKIM and DMARC on a separate sending '
    + 'domain, then 10-15 a day for a week before this batch goes anywhere. The '
    + 'engine defaults (30/day, 90s between sends) already assume this; do not raise '
    + 'them for the first run.',
  ));
  console.log(wrap(
    '\nUse a subdomain you are willing to lose (e.g. mail.yourdomain.com), never your '
    + 'primary domain. The experiment is worth more than the domain is.',
  ));
}

async function ensureCampaigns(): Promise<Campaign[]> {
  const store = await getStore();
  const icp = EXPERIMENT_01;
  const existing = await store.listCampaigns();

  // One campaign per city: OSM is queried per area, and a per-city split also
  // shows which cities actually have usable data before you scale.
  const perCity = Math.ceil(TARGET / icp.cities.length);
  const campaigns: Campaign[] = [];

  for (const city of icp.cities) {
    const name = `EXP01 ${icp.name.split(' ').slice(0, 3).join(' ')} — ${city}`;
    const found = existing.find((c) => c.name === name);
    campaigns.push(found ?? await store.insertCampaign({
      name,
      industry: icp.industry,
      country: icp.country,
      city,
      daily_target: perCity * 2,
      // Draft everything the audit approves of; you throttle at approval, not here.
      daily_send_cap: perCity,
      build_fee_eur: icp.offer.build_gbp[0],
      monthly_fee_eur: icp.offer.monthly_gbp[0],
      outreach_mode: 'email',
      status: 'active',
    }));
  }
  return campaigns;
}

async function run(demo: boolean) {
  const icp = EXPERIMENT_01;
  const provider = activeProvider();

  h1(`EXPERIMENT 01 — ${demo ? 'OFFLINE REHEARSAL' : 'LIVE RUN'}`);
  console.log(`ICP:       ${icp.name}`);
  console.log(`Target:    ${TARGET} leads across ${icp.cities.length} cities`);
  console.log(`Reasoning: ${provider.name} (${provider.model})`);
  if (provider.problem) {
    console.log(`WARNING: ${provider.problem}`);
    console.log(`Falling back to ${provider.model}.`);
  }
  if (provider.name === 'heuristic') {
    console.log('\nWARNING: no ANTHROPIC_API_KEY. The heuristic analyst pattern-matches where');
    console.log('Claude reads. For a real experiment the audit quality IS the offer - set the key.');
  }
  if (demo) {
    console.log('\nDEMO MODE: generated companies on .example domains. Rehearsal only.');
  }

  const campaigns = await ensureCampaigns();
  const companies = demoCompanies(TARGET);
  let selected = 0;
  let discovered = 0;
  let rejected = 0;
  const dropReasons = new Map<string, number>();

  for (const campaign of campaigns) {
    process.stdout.write(`\n${campaign.city}… `);
    try {
      const result = await runDailyCampaign(campaign, demo
        ? { searchFetch: demoSearchFetch(companies), siteFetcher: demoSiteFetcher(companies) }
        : {});
      discovered += result.discovered;
      rejected += result.audit_rejected;
      selected += result.selected.length;
      for (const d of result.dropped) {
        const key = d.reason.split(':')[0].slice(0, 60);
        dropReasons.set(key, (dropReasons.get(key) ?? 0) + 1);
      }
      process.stdout.write(`found ${result.discovered}, drafted ${result.selected.length}`);
    } catch (err) {
      // One city failing (no OSM coverage, a rate limit) must not lose the rest.
      process.stdout.write(`FAILED: ${err instanceof Error ? err.message : err}`);
    }
  }

  const d = await engineDashboard(100);

  h1('RESULT');
  console.log(`  companies found      ${discovered}`);
  console.log(`  audits rejected      ${rejected}  (thin or unreadable sites - correct behaviour)`);
  console.log(`  leads drafted        ${selected}`);
  console.log(`  awaiting your call   ${d.messages.awaiting_approval}  (first touches - this is what you decide on)`);
  console.log(`  follow-ups behind    ${d.messages.follow_ups_pending_first_touch}  (drafted, blocked until their first touch sends)`);
  console.log(`  sent                 ${d.messages.sent}   <- stays 0 until you approve and send`);

  if (dropReasons.size > 0) {
    h2('WHY COMPANIES WERE DROPPED');
    for (const [reason, n] of [...dropReasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
      console.log(`  ${String(n).padStart(4)}  ${reason}`);
    }
  }

  h2('NEXT');
  console.log('  1. Open /engine and read the drafts. Reject anything that reads generic.');
  console.log('  2. Approve in batches of 10-15 per day. Do not approve all 100 at once.');
  console.log('  3. npm run engine -- send   (dry run until you set the two send switches)');
  console.log(`  4. After ${TARGET} are out: npm run experiment -- --status`);
}

async function status() {
  const d = await engineDashboard(1);
  const icp = EXPERIMENT_01;

  h1('EXPERIMENT 01 — STATUS');
  const sent = d.messages.sent;
  const bounces = d.replies.bounce;
  const delivered = sent - bounces;
  const humanReplies = d.replies.total - d.replies.bounce
    - (d.replies.total - d.replies.positive - d.replies.booked - d.replies.negative
      - d.replies.unsubscribe - d.replies.bounce);
  const positive = d.replies.positive + d.replies.booked;
  const pct = (n: number) => (sent > 0 ? `${((n / sent) * 100).toFixed(1)}%` : '—');

  console.log(`  sent            ${sent}${sent < TARGET ? `  (${TARGET - sent} to go)` : ''}`);
  console.log(`  delivered       ${delivered}  ${pct(delivered)}`);
  console.log(`  replies         ${humanReplies}  ${pct(humanReplies)}`);
  console.log(`  positive        ${positive}  ${pct(positive)}`);
  console.log(`  booked          ${d.replies.booked}`);
  console.log(`  rejected        ${d.replies.negative}`);
  console.log(`  unsubscribed    ${d.replies.unsubscribe}  ${pct(d.replies.unsubscribe)}`);
  console.log(`  bounced         ${bounces}  ${pct(bounces)}`);

  if (sent < TARGET) {
    console.log(`\n  Too early to decide. Thresholds are read at ${TARGET} sent.`);
    return;
  }

  h2('AGAINST THE THRESHOLDS');
  const replyPct = (humanReplies / sent) * 100;
  const positivePct = (positive / sent) * 100;
  const bouncePct = (bounces / sent) * 100;
  const unsubPct = (d.replies.unsubscribe / sent) * 100;

  const verdict = (ok: boolean, label: string, actual: string) =>
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(28)} ${actual}`);

  verdict(bouncePct <= 5, 'bounce <= 5%', `${bouncePct.toFixed(1)}%`);
  verdict(replyPct >= 6, 'reply >= 6%', `${replyPct.toFixed(1)}%`);
  verdict(positivePct >= 3, 'positive >= 3%', `${positivePct.toFixed(1)}%`);
  verdict(d.replies.booked >= 2, 'booked >= 2', `${d.replies.booked}`);
  verdict(unsubPct <= 2, 'unsubscribe <= 2%', `${unsubPct.toFixed(1)}%`);

  h2('VERDICT');
  if (bouncePct > 5) {
    console.log(wrap('Data quality. Do not read any other metric - fix address verification '
      + 'and re-run. The denominator is broken.'));
  } else if (unsubPct > 2) {
    console.log(wrap('The message reads as bulk. Stop sending, rewrite the opener, rest the domain.'));
  } else if (replyPct >= 6 && positivePct >= 3) {
    console.log(wrap('ICP and offer both work. Scale: add the next two cities, change nothing else.'));
  } else if (replyPct >= 6) {
    console.log(wrap('ICP works, offer does not. Keep the list, change the offer.'));
  } else if (replyPct >= 2) {
    console.log(wrap('Inconclusive - most likely copy or deliverability. Re-run 100 with a '
      + 'different subject and opener from the same ICP before concluding anything about the market.'));
  } else {
    console.log(wrap(`The ICP is wrong. Switch vertical - next candidate: ${icp.rejected[1].option}.`));
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--report')) return report();
  if (argv.includes('--status')) return status();
  if (argv.includes('--run')) return run(argv.includes('--demo'));
  console.error('usage: npm run experiment -- <--report|--run [--demo]|--status>');
  process.exit(2);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
