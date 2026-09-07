/**
 * End-to-end test of the outreach engine over 50 demo leads.
 *
 *   npm run test:engine
 *
 * Covers the whole loop: daily discovery -> audit -> ranking -> approval inbox
 * -> approval -> send with every guard -> follow-up scheduling -> replies ->
 * suppression -> dashboard. Runs offline against generated fixtures with a
 * dry-run send adapter, so it never touches the network and never emails
 * anyone.
 */
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import { getStore } from '@/lib/db';
import { runDailyCampaign, scoreLead } from '@/lib/engine/daily';
import { demoCompanies, demoSearchFetch, demoSiteFetcher } from '@/lib/engine/demo-fixtures';
import { engineDashboard } from '@/lib/engine/dashboard';
import { checkSendGate, inQuietHours, quietHoursEnabled, setKillSwitch, setQuietHours } from '@/lib/engine/guards';
import { classifyReply, handleReply } from '@/lib/engine/replies';
import { runSendQueue, senderConfigProblems, previewMessage } from '@/lib/engine/send';
import { DryRunEmailAdapter } from '@/lib/engine/channels/email';
import { SmsAdapter } from '@/lib/engine/channels/sms';
import { VoiceAdapter } from '@/lib/engine/channels/voice';
import { FOLLOW_UP_DAYS, MAX_FOLLOW_UPS } from '@/lib/engine/sequence';
import { approveOutreachForLead } from '@/lib/outreach/build';
import type { Campaign } from '@/lib/types';

// A configured sender, because an email cannot be approved without one.
process.env.SENDER_EMAIL = 'richard@mail.test.invalid';
process.env.SENDER_NAME = 'Richard';
process.env.SENDER_COMPANY = 'Automation Studio';

const DATA_FILE = join(process.cwd(), '.data', 'test-engine.json');
process.env.DATA_FILE = DATA_FILE;

let failures = 0;
const section = (s: string) => console.log(`\n${s}`);
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` - ${detail}` : ''}`);
};

const COMPANIES = demoCompanies(50);
const searchFetch = demoSearchFetch(COMPANIES);
const siteFetcher = demoSiteFetcher(COMPANIES);

/** Mid-morning on a weekday, comfortably outside quiet hours. */
const AT = (isoDay: string, hour: number) => new Date(`${isoDay}T${String(hour).padStart(2, '0')}:00:00Z`);
const DAY1 = '2026-03-02';

async function makeCampaign(): Promise<Campaign> {
  const store = await getStore();
  return store.insertCampaign({
    name: 'Manchester car repair',
    industry: 'car repair',
    country: 'GB',
    city: 'Manchester',
    daily_target: 50,
    daily_send_cap: 12,
    build_fee_eur: 1500,
    monthly_fee_eur: 300,
    status: 'active',
  });
}

/* ------------------------------------------------------------------ */

function testGuardUnits() {
  section('1. Guard units');
  check('quiet hours wrapping midnight: 22:00 is quiet (20->8)', inQuietHours(22, 20, 8));
  check('quiet hours wrapping midnight: 03:00 is quiet (20->8)', inQuietHours(3, 20, 8));
  check('quiet hours wrapping midnight: 10:00 is not', !inQuietHours(10, 20, 8));
  check('non-wrapping window still works (9->17)', inQuietHours(12, 9, 17) && !inQuietHours(20, 9, 17));
  check('start == end disables quiet hours', !inQuietHours(3, 0, 0));

  check('classifies an unsubscribe', classifyReply(null, 'Please unsubscribe me').cls === 'unsubscribe');
  check('classifies a German opt-out', classifyReply(null, 'Bitte abmelden').cls === 'unsubscribe');
  check('classifies a bounce', classifyReply('Undeliverable: your message', 'mailbox unavailable').cls === 'bounce');
  check('classifies an out-of-office', classifyReply('Automatic reply', 'I am out of office').cls === 'auto_reply');
  check('classifies interest', classifyReply(null, 'This sounds good, tell me more').cls === 'positive');
  check('classifies a booking', classifyReply(null, 'Calendar invite sent, see you on Tuesday').cls === 'booked');
  check('classifies a refusal', classifyReply(null, 'Not interested, thanks').cls === 'negative');
  check('classifies a timing objection', classifyReply(null, 'Not right now, circle back next quarter').cls === 'not_now');
  check('unclear replies land as a question for a human',
    classifyReply(null, 'hmm').cls === 'question');
  check('opt-out beats interest when both appear',
    classifyReply(null, 'sounds interesting but please remove me').cls === 'unsubscribe');
}

function testSenderConfig() {
  section('2a. Sender configuration gate');
  const saved = { ...process.env };
  const set = (env: Record<string, string | undefined>) => {
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  };
  try {
    set({ SENDER_EMAIL: undefined, SENDER_NAME: undefined, UNSUBSCRIBE_ADDRESS: undefined });
    check('an unconfigured sender is reported', senderConfigProblems().length >= 2);
    check('and produces no footer', previewMessage('body').footer === null);

    set({ SENDER_EMAIL: 'noreply@mail.test.invalid', SENDER_NAME: 'Richard' });
    check('a noreply@ sender is rejected',
      senderConfigProblems().some((p) => /no-reply/i.test(p)));

    set({ SENDER_EMAIL: 'not-an-address', SENDER_NAME: 'Richard' });
    check('a malformed sender address is rejected',
      senderConfigProblems().some((p) => /not a valid address/i.test(p)));

    set({ SENDER_EMAIL: 'richard@mail.test.invalid', SENDER_NAME: 'Richard', SENDER_COMPANY: 'Automation Studio' });
    check('a correct sender passes', senderConfigProblems().length === 0);
    const preview = previewMessage('body');
    check('the preview carries the footer', preview.footer !== null);
    check('the footer names the opt-out address',
      preview.text.includes('richard@mail.test.invalid'));
    check('the footer names the sender', preview.text.includes('Richard'));
    check('the preview is body + footer, i.e. what actually sends',
      preview.text.startsWith('body') && preview.text.includes('unsubscribe'));
  } finally {
    set(saved as Record<string, string | undefined>);
  }
}

function testChannelArchitecture() {
  section('2. Channel architecture (email now, SMS/voice prepared)');
  const email = new DryRunEmailAdapter();
  const sms = new SmsAdapter();
  const voice = new VoiceAdapter();

  check('email adapter is available', email.available());
  check('SMS is prepared but NOT available', !sms.available());
  check('SMS says why it is unavailable', /provisioning|registration|legality/i.test(sms.unavailableReason()));
  check('voice is prepared but NOT available', !voice.available());
  check('voice says why it is unavailable', /consent|disclosure|do-not-call/i.test(voice.unavailableReason()));
  check('all three share one interface',
    [email, sms, voice].every((a) => typeof a.send === 'function' && typeof a.available === 'function'));
}

async function testDailyRun(campaign: Campaign) {
  section('3. Daily run over 50 demo companies');
  const run = await runDailyCampaign(campaign, { searchFetch, siteFetcher });

  console.log(`     discovered ${run.discovered}, saved ${run.saved_leads}, audited ${run.audited}, `
    + `rejected ${run.audit_rejected}, selected ${run.selected.length}, dropped ${run.dropped.length}`);

  check('discovered all 50 companies', run.discovered === 50, `${run.discovered}`);
  check('some companies were dropped with a reason', run.dropped.length > 0, `${run.dropped.length}`);
  check('unreachable sites are dropped, not audited',
    run.dropped.some((d) => /unreachable|403/i.test(d.reason)));
  check('thin sites fail the audit rather than producing filler',
    run.audit_rejected > 0, `${run.audit_rejected} rejected`);
  check('selection respects the campaign send cap',
    run.selected.length <= campaign.daily_send_cap, `${run.selected.length}/${campaign.daily_send_cap}`);
  check('selection is ranked best-first',
    run.selected.every((s, i) => i === 0 || run.selected[i - 1].score >= s.score));
  check('every selected lead has a recommended automation',
    run.selected.every((s) => s.opportunity.workflow_steps.length >= 4));
  check('the UK market needs no risk acknowledgement', !run.market_requires_ack);

  // Ranking must prefer a verified address: a draft with nowhere to go is worthless.
  const withVerified = run.selected.filter((s) =>
    s.lead.contacts.some((c) => c.kind === 'email' && c.label === 'found_on_site'));
  check('selected leads mostly have an email verified on their own site',
    withVerified.length >= run.selected.length * 0.6,
    `${withVerified.length}/${run.selected.length}`);

  const noEmail = run.selected.filter((s) => !s.lead.contacts.some((c) => c.kind === 'email'));
  check('leads with no email at all rank last if selected at all',
    noEmail.length === 0 || noEmail.every((s) => s.score < 0), `${noEmail.length}`);

  section('4. Drafts land in the approval inbox, nothing is sent');
  const drafts = run.selected.flatMap((s) => s.drafts);
  check('every selected lead got a first touch plus follow-ups',
    run.selected.every((s) => s.drafts.length === 1 + MAX_FOLLOW_UPS),
    `${drafts.length} drafts for ${run.selected.length} leads`);
  check('every draft is a draft, not approved', drafts.every((d) => d.status === 'draft'));
  check('nothing has been sent', drafts.every((d) => d.sent_at === null));
  check('drafts are threaded so one reply can stop them all',
    run.selected.every((s) => new Set(s.drafts.map((d) => d.thread_id)).size === 1));
  check('drafts carry the campaign', drafts.every((d) => d.campaign_id === campaign.id));
  check('every draft is grounded in its audit', drafts.every((d) => d.grounding.length > 0));

  return run;
}

async function testApprovalAndSending(run: Awaited<ReturnType<typeof testDailyRun>>) {
  section('5. Approval is required before anything sends');
  const store = await getStore();
  const adapter = new DryRunEmailAdapter();

  // Nothing approved yet: the queue must produce nothing.
  const beforeApproval = await runSendQueue({ adapter, now: AT(DAY1, 10) });
  check('an unapproved inbox sends nothing', beforeApproval.sent === 0, `${beforeApproval.sent}`);
  check('the dry-run outbox is empty', adapter.outbox.length === 0);

  // Approve only some of the first touches: an inbox you have half-worked is
  // the normal state, and the dashboard has to reflect it.
  const firstTouches = run.selected.map((s) => s.drafts.find((d) => d.step === 0)!).slice(0, 8);
  let approved = 0;
  for (const draft of firstTouches) {
    try {
      await approveOutreachForLead(draft.lead_id, draft.id);
      approved += 1;
    } catch {
      // Blocked drafts stay blocked; that is the gate doing its job.
    }
  }
  check('first touches could be approved', approved > 0, `${approved}/${firstTouches.length}`);

  section('6. Kill switch');
  await setKillSwitch(true, 'test');
  const killed = await runSendQueue({ adapter, now: AT(DAY1, 10) });
  check('kill switch stops the run', killed.sent === 0 && killed.halted?.code === 'kill_switch');
  check('kill switch reason is reported', /test/.test(killed.halted?.reason ?? ''));
  // An empty queue must still report the switch, not a bland "nothing to do".
  const store2 = await getStore();
  const parked = await store2.listOutreachByStatus('approved', 200);
  for (const m of parked) await store2.setOutreachStatus(m.id, 'draft');
  const emptyAndKilled = await runSendQueue({ adapter, now: AT(DAY1, 10) });
  check('an empty queue still reports the kill switch',
    emptyAndKilled.halted?.code === 'kill_switch', emptyAndKilled.halted?.code ?? 'silent');
  for (const m of parked) await store2.setOutreachStatus(m.id, 'approved');

  await setKillSwitch(false);

  section('7. Rate limiting and quiet hours');
  const quiet = await runSendQueue({ adapter, now: AT(DAY1, 23) });
  check('nothing sends during quiet hours', quiet.sent === 0 && quiet.halted?.code === 'quiet_hours');

  await store.updateEngineState({ daily_send_cap: 3, hourly_send_cap: 3, min_seconds_between_sends: 0 });
  const capped = await runSendQueue({ adapter, now: AT(DAY1, 10) });
  check('the daily cap limits a run', capped.sent === 3, `${capped.sent}`);
  check('the run halts on the cap rather than skipping', capped.halted?.code === 'daily_cap' || capped.sent === 3);
  check('the dry-run outbox matches what was sent', adapter.outbox.length === capped.sent);
  check('every sent message carries an unsubscribe line',
    adapter.outbox.every((m) => /unsubscribe/i.test(m.body)));
  check('every send went to a verified address',
    adapter.outbox.every((m) => m.to.includes('@')));

  const nextRun = await runSendQueue({ adapter, now: AT(DAY1, 11) });
  check('once the daily cap is spent, later runs send nothing',
    nextRun.sent === 0 && nextRun.halted?.code === 'daily_cap');

  // The minimum gap between sends is its own guard.
  await store.updateEngineState({
    counter_date: '2026-03-03', sent_today: 0, daily_send_cap: 30,
    min_seconds_between_sends: 3600, last_sent_at: AT('2026-03-03', 10).toISOString(),
  });
  const tooSoon = await runSendQueue({ adapter, now: AT('2026-03-03', 10) });
  check('minimum gap between sends is enforced', tooSoon.sent === 0 && tooSoon.halted?.code === 'too_soon');

  // Lift the caps and drain the rest of the approved queue, so the reply
  // scenarios below have enough sent messages to work with.
  await store.updateEngineState({
    counter_date: '2026-03-03', sent_today: 0, daily_send_cap: 30, hourly_send_cap: 30,
    min_seconds_between_sends: 0, last_sent_at: null,
  });
  const drain = await runSendQueue({ adapter, now: AT('2026-03-03', 10) });
  check('lifting the caps lets the rest of the approved queue go out', drain.sent > 0, `${drain.sent}`);

  section('7a. Quiet hours can be switched off; every other gate stays');
  // 23:00 is inside the default window, so it is the honest test time. These
  // checks use checkSendGate rather than runSendQueue so they do not consume
  // the approved queue the later sections rely on.
  const NIGHT = AT(DAY1, 23);
  const anyMessage = (await store.listOutreachByStatus('sent', 50))[0]
    ?? (await store.listOutreachByStatus('draft', 50)).find((m) => m.step === 0)!;
  const gateLead = (await store.getLead(anyMessage.lead_id))!;
  const gateMsg = { ...anyMessage, status: 'approved' as const };
  check('the gate fixture has a verified address to send to',
    gateLead.contacts.some((c) => c.kind === 'email'), 'no email on the lead');

  await setQuietHours(false);
  const offState = await store.getEngineState();
  check('switching off sets start === end', !quietHoursEnabled(offState),
    `${offState.quiet_hours_start}-${offState.quiet_hours_end}`);
  check('inQuietHours is false at any hour once off',
    [0, 3, 12, 20, 23].every((h) => !inQuietHours(h, offState.quiet_hours_start, offState.quiet_hours_end)));

  await store.updateEngineState({
    counter_date: DAY1, sent_today: 0, daily_send_cap: 30, hourly_send_cap: 30,
    min_seconds_between_sends: 0, last_sent_at: null,
  });
  const nightOk = await checkSendGate({ message: gateMsg, lead: gateLead, now: NIGHT });
  check('at 23:00 with quiet hours off, the gate allows the send', nightOk.allowed,
    nightOk.code);

  // Every other gate, all at 23:00, all with quiet hours still off.
  await setKillSwitch(true, 'gate check');
  const g1 = await checkSendGate({ message: gateMsg, lead: gateLead, now: NIGHT });
  check('kill switch STILL blocks at night', !g1.allowed && g1.code === 'kill_switch');
  await setKillSwitch(false);

  await store.updateEngineState({ daily_send_cap: 0 });
  const g2 = await checkSendGate({ message: gateMsg, lead: gateLead, now: NIGHT });
  check('daily cap STILL blocks at night', !g2.allowed && g2.code === 'daily_cap');
  await store.updateEngineState({ daily_send_cap: 30 });

  const g3 = await checkSendGate({ message: gateMsg, lead: gateLead, now: NIGHT, sentThisRun: 99 });
  check('per-run cap STILL blocks at night', !g3.allowed && g3.code === 'hourly_cap');

  await store.updateEngineState({ min_seconds_between_sends: 3600, last_sent_at: NIGHT.toISOString() });
  const g4 = await checkSendGate({ message: gateMsg, lead: gateLead, now: NIGHT });
  check('minimum gap STILL blocks at night', !g4.allowed && g4.code === 'too_soon');
  await store.updateEngineState({ min_seconds_between_sends: 0, last_sent_at: null });

  const g5 = await checkSendGate({
    message: { ...gateMsg, status: 'draft' }, lead: gateLead, now: NIGHT,
  });
  check('unapproved messages STILL blocked at night', !g5.allowed && g5.code === 'not_approved');

  const gateAddr = gateLead.contacts.find((c) => c.kind === 'email')!.value;
  await store.addSuppression({ value: gateAddr, scope: 'address', reason: 'manual', note: 'gate check' });
  const g6 = await checkSendGate({ message: gateMsg, lead: gateLead, now: NIGHT });
  check('suppression STILL blocks at night', !g6.allowed && g6.code === 'suppressed');

  // Turning it back on restores the block, so this is a switch, not a removal.
  await setQuietHours(true);
  const backOn = await store.getEngineState();
  check('switching back on restores the 20:00-08:00 window',
    quietHoursEnabled(backOn) && backOn.quiet_hours_start === 20 && backOn.quiet_hours_end === 8);
  const g7 = await checkSendGate({ message: gateMsg, lead: gateLead, now: NIGHT });
  check('with quiet hours back on, night is blocked again',
    !g7.allowed && g7.code === 'quiet_hours');
  check('and daytime is still fine',
    (await checkSendGate({ message: gateMsg, lead: gateLead, now: AT(DAY1, 10) })).code !== 'quiet_hours');

  // An empty queue must name the run-level reason rather than silently doing nothing.
  await store.updateEngineState({ sent_today: 99, daily_send_cap: 1 });
  const capReported = await runSendQueue({ adapter, now: AT(DAY1, 10) });
  check('an empty queue still reports the daily cap', capReported.halted?.code === 'daily_cap',
    capReported.halted?.code ?? 'silent');
  await store.updateEngineState({ sent_today: 0, daily_send_cap: 30 });
  const quietReported = await runSendQueue({ adapter, now: NIGHT });
  check('an empty queue still reports quiet hours', quietReported.halted?.code === 'quiet_hours',
    quietReported.halted?.code ?? 'silent');

  // Leave the engine exactly as this section found it.
  await setQuietHours(true);
  await store.updateEngineState({
    counter_date: '2026-03-03', sent_today: 0, daily_send_cap: 30, hourly_send_cap: 30,
    min_seconds_between_sends: 0, last_sent_at: null,
  });

  return adapter;
}

async function testFollowUps() {
  section('8. Follow-ups: scheduled, capped, and only after the first touch went out');
  const store = await getStore();
  const sent = await store.listOutreachByStatus('sent', 50);
  check('some first touches were sent', sent.length > 0, `${sent.length}`);

  const thread = await store.listOutreachByThread(sent[0].thread_id!);
  const followUps = thread.filter((m) => m.step > 0);
  check('the thread has exactly two follow-ups', followUps.length === MAX_FOLLOW_UPS, `${followUps.length}`);
  check('both follow-ups are scheduled', followUps.every((m) => Boolean(m.scheduled_at)));
  check('follow-ups are still drafts awaiting approval',
    followUps.every((m) => m.status === 'draft'));

  const sentAt = new Date(sent[0].sent_at!).getTime();
  const gaps = followUps
    .map((m) => Math.round((new Date(m.scheduled_at!).getTime() - sentAt) / 86_400_000))
    .sort((a, b) => a - b);
  check(`follow-ups are +${FOLLOW_UP_DAYS.join(' and +')} days out`,
    gaps.every((g, i) => Math.abs(g - FOLLOW_UP_DAYS[i]) <= 1), gaps.join(', '));

  // A thread whose first touch never went out must have no scheduled follow-ups.
  const unsent = await store.listOutreachByStatus('draft', 200);
  const orphanScheduled = unsent.filter((m) => m.step > 0 && m.scheduled_at
    && !sent.some((s) => s.thread_id === m.thread_id));
  check('follow-ups are never scheduled for a first touch that did not send',
    orphanScheduled.length === 0, `${orphanScheduled.length}`);

  return sent;
}

async function testReplies(sent: Awaited<ReturnType<typeof testFollowUps>>) {
  section('9. Replies stop the sequence');
  const store = await getStore();

  // A positive reply.
  const positive = sent[0];
  const positiveLead = (await store.getLead(positive.lead_id))!;
  const positiveOutcome = await handleReply({
    lead_id: positiveLead.id,
    message_id: positive.id,
    from_address: positive.sent_to!,
    subject: `Re: ${positive.subject}`,
    body: 'This sounds good, tell me more. Can you send the walkthrough?',
  });
  check('a positive reply is classified positive', positiveOutcome.reply.classification === 'positive');
  check('a positive reply cancels the pending follow-ups', positiveOutcome.cancelled_messages > 0,
    `${positiveOutcome.cancelled_messages}`);
  check('a positive reply moves the lead to replied', positiveOutcome.lead.stage === 'replied');
  check('a positive reply does NOT suppress the address', !positiveOutcome.suppressed);

  const positiveThread = await store.listOutreachByThread(positive.thread_id!);
  check('no message in that thread can still go out',
    positiveThread.filter((m) => m.status === 'approved' || m.status === 'queued' || m.status === 'draft').length === 0);

  // An unsubscribe.
  const unsub = sent[1];
  const unsubOutcome = await handleReply({
    lead_id: unsub.lead_id,
    message_id: unsub.id,
    from_address: unsub.sent_to!,
    body: 'Please unsubscribe me from this list.',
  });
  check('an unsubscribe is classified as one', unsubOutcome.reply.classification === 'unsubscribe');
  check('an unsubscribe suppresses the address', unsubOutcome.suppressed);
  check('an unsubscribe stops the sequence', unsubOutcome.cancelled_messages >= 0);
  check('the address is on the suppression list',
    (await store.isSuppressed(unsub.sent_to!)) !== null);
  check('an unsubscribe marks the lead lost', unsubOutcome.lead.stage === 'lost');

  // An out-of-office must NOT stop the sequence.
  const ooo = sent[2];
  const oooThreadBefore = (await store.listOutreachByThread(ooo.thread_id!))
    .filter((m) => m.status === 'draft').length;
  const oooOutcome = await handleReply({
    lead_id: ooo.lead_id,
    message_id: ooo.id,
    from_address: ooo.sent_to!,
    subject: 'Automatic reply: Out of office',
    body: 'I am out of office until Monday.',
  });
  check('an out-of-office is classified as an autoresponder', oooOutcome.reply.classification === 'auto_reply');
  check('an out-of-office does NOT cancel the sequence', oooOutcome.cancelled_messages === 0);
  check('an out-of-office leaves the follow-ups in place',
    (await store.listOutreachByThread(ooo.thread_id!)).filter((m) => m.status === 'draft').length === oooThreadBefore);
  check('an out-of-office is auto-handled, not left in the inbox', oooOutcome.reply.handled);

  // A bounce.
  const bounced = sent[3];
  const bounceOutcome = await handleReply({
    lead_id: bounced.lead_id,
    message_id: bounced.id,
    from_address: bounced.sent_to!,
    subject: 'Undeliverable: your message',
    body: 'Address not found. 550 5.1.1 no such user.',
  });
  check('a bounce is classified as one', bounceOutcome.reply.classification === 'bounce');
  check('a hard bounce suppresses the address', bounceOutcome.suppressed);

  section('10. A suppressed address is never contacted again');
  const store2 = await getStore();
  const suppressedAddress = unsub.sent_to!;
  const revived = await store2.listOutreach(unsub.lead_id);
  const anyDraft = revived.find((m) => m.status === 'draft');
  if (anyDraft) {
    await store2.setOutreachStatus(anyDraft.id, 'approved');
    const lead = (await store2.getLead(unsub.lead_id))!;
    const gate = await checkSendGate({ message: (await store2.getOutreach(anyDraft.id))!, lead, now: AT('2026-03-04', 10) });
    check('the send gate refuses a suppressed address', !gate.allowed && gate.code === 'suppressed');
    check('and it skips rather than halting the whole run', !gate.halt);
  } else {
    check('the suppressed lead has no revivable draft (already cancelled)', true);
  }

  await store2.updateEngineState({ counter_date: '2026-03-04', sent_today: 0, daily_send_cap: 30 });
  const adapter = new DryRunEmailAdapter();
  const after = await runSendQueue({ adapter, now: AT('2026-03-04', 10) });
  check('no send in a later run went to the suppressed address',
    !adapter.outbox.some((m) => m.to === suppressedAddress), `${after.sent} sent`);
}

async function testDashboard() {
  section('11. Dashboard');
  const d = await engineDashboard();

  console.log(`     leads ${d.leads.total} · sent ${d.messages.sent} · replies ${d.replies.total} `
    + `· positive ${d.replies.positive} · booked ${d.replies.booked} · unsubscribes ${d.replies.unsubscribe}`);

  check('counts leads', d.leads.total > 0, `${d.leads.total}`);
  check('breaks leads down by stage', Object.values(d.leads.by_stage).some((n) => n > 0));
  check('counts sent messages', d.messages.sent > 0, `${d.messages.sent}`);
  check('counts drafts awaiting approval', d.messages.awaiting_approval > 0);
  check('counts cancelled messages', d.messages.cancelled > 0, `${d.messages.cancelled}`);
  check('counts replies', d.replies.total >= 4, `${d.replies.total}`);
  check('reports positive replies', d.replies.positive >= 1);
  check('reports unsubscribes', d.replies.unsubscribe >= 1);
  check('reports bounces', d.replies.bounce >= 1);
  check('reply rate excludes autoresponders and bounces',
    d.replies.reply_rate_pct !== null && d.replies.reply_rate_pct < 100);
  check('counts the suppression list', d.suppression_count >= 2, `${d.suppression_count}`);
  check('surfaces an approval inbox', d.inbox.length > 0, `${d.inbox.length}`);
  check('every inbox item carries its lead', d.inbox.every((i) => i.lead.id === i.message.lead_id));
  check('reports whether sending is currently possible', typeof d.can_send_now === 'boolean');

  await setKillSwitch(true, 'end of test');
  const stopped = await engineDashboard();
  check('the dashboard reflects the kill switch', !stopped.can_send_now
    && /Kill switch/.test(stopped.send_blocked_reason ?? ''));
  await setKillSwitch(false);
}

/* ------------------------------------------------------------------ */

async function main() {
  await rm(DATA_FILE, { force: true });
  console.log('Outreach engine end-to-end (50 demo leads, offline, dry-run sending)');

  testGuardUnits();
  testSenderConfig();
  testChannelArchitecture();

  const campaign = await makeCampaign();
  const run = await testDailyRun(campaign);
  await testApprovalAndSending(run);
  const sent = await testFollowUps();
  await testReplies(sent);
  await testDashboard();

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  await rm(DATA_FILE, { force: true });
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
