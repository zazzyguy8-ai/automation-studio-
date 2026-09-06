/**
 * Tests for the pipeline: argument parsing, provider selection, the full
 * URL -> proposal run, database persistence, and the failure paths.
 *
 *   npm run test:pipeline
 *
 * Runs offline against bundled fixtures and its own data file, so it never
 * touches the network or the working store.
 */
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import { PipelineArgsError, parsePipelineArgs } from '@/lib/pipeline/args';
import { activeProvider, runPipeline, verifyPersisted } from '@/lib/pipeline/run';
import { fixtureFetcher } from '@/lib/scrape/fixture-fetcher';
import { getStore } from '@/lib/db';
import type { Fetcher } from '@/lib/scrape/crawl';

const DATA_FILE = join(process.cwd(), '.data', 'test-pipeline.json');
process.env.DATA_FILE = DATA_FILE;

let failures = 0;
let group = '';

const section = (s: string) => {
  group = s;
  console.log(`\n${s}`);
};

const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` - ${detail}` : ''}`);
  void group;
};

function throws(label: string, fn: () => unknown, expect?: RegExp) {
  try {
    fn();
    check(label, false, 'no error thrown');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isArgsError = err instanceof PipelineArgsError;
    check(label, isArgsError && (!expect || expect.test(message)), message);
  }
}

/* ------------------------------------------------------------------ */
/* 1 — argument parsing                                                */
/* ------------------------------------------------------------------ */

function testArgs() {
  section('1. Argument parsing');

  const url = parsePipelineArgs(['https://example.sk', '--industry', 'auto repair', '--country', 'SK']);
  check('parses url + industry + country',
    url.website === 'https://example.sk' && url.industry === 'auto repair' && url.country === 'SK');
  check('a multi-word --industry value is not mistaken for the URL', url.website === 'https://example.sk');
  check('defaults: 1500 build / 300 monthly / 2 emails',
    url.buildFee === 1500 && url.monthlyFee === 300 && url.emailSteps === 2);

  const fx = parsePipelineArgs(['--fixture', 'karoseria-hronec']);
  check('--fixture fills url, industry and country',
    fx.website === 'https://karoseria-hronec.sk' && fx.industry === 'auto body repair' && fx.country === 'SK');
  check('--fixture records which fixture to serve', fx.fixture === 'karoseria-hronec');

  const over = parsePipelineArgs(['--fixture', 'praxis-lindner', '--country', 'DE', '--emails', '3']);
  check('explicit flags override fixture presets', over.country === 'DE' && over.emailSteps === 3);

  const fees = parsePipelineArgs(['https://x.sk', '--build-fee', '3000', '--monthly-fee', '800']);
  check('fee flags parse as numbers', fees.buildFee === 3000 && fees.monthlyFee === 800);

  throws('rejects an unknown option', () => parsePipelineArgs(['https://x.sk', '--nope']), /unknown option/);
  throws('rejects a flag with no value', () => parsePipelineArgs(['https://x.sk', '--industry']), /needs a value/);
  throws('rejects a flag whose value is another flag',
    () => parsePipelineArgs(['https://x.sk', '--industry', '--country']), /needs a value/);
  throws('rejects an unknown fixture', () => parsePipelineArgs(['--fixture', 'nope']), /unknown fixture/);
  throws('rejects url and fixture together',
    () => parsePipelineArgs(['https://x.sk', '--fixture', 'novak-reality']), /not both/);
  throws('rejects two URLs', () => parsePipelineArgs(['https://a.sk', 'https://b.sk']), /expected one URL/);
  throws('rejects no arguments at all', () => parsePipelineArgs([]), /URL is required/);
  throws('rejects a value that is not a URL', () => parsePipelineArgs(['not-a-url']), /does not look like a URL/);
  throws('rejects a negative fee',
    () => parsePipelineArgs(['https://x.sk', '--build-fee', '-5']), /non-negative/);
  throws('rejects a non-numeric fee',
    () => parsePipelineArgs(['https://x.sk', '--monthly-fee', 'lots']), /non-negative/);
}

/* ------------------------------------------------------------------ */
/* 2 — provider selection                                              */
/* ------------------------------------------------------------------ */

function testProvider() {
  section('2. Provider selection');
  const { ANTHROPIC_API_KEY, REASONING_PROVIDER } = process.env;
  try {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.REASONING_PROVIDER;
    check('falls back to heuristic with no key', activeProvider().name === 'heuristic');

    process.env.ANTHROPIC_API_KEY = 'test-key-not-real';
    const withKey = activeProvider();
    check('uses Claude when a key is present', withKey.name === 'anthropic', withKey.name);
    check('reports the audit model', withKey.model === 'claude-opus-5', withKey.model);

    process.env.REASONING_PROVIDER = 'heuristic';
    check('REASONING_PROVIDER overrides the key', activeProvider().name === 'heuristic');
  } finally {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.REASONING_PROVIDER;
    if (ANTHROPIC_API_KEY) process.env.ANTHROPIC_API_KEY = ANTHROPIC_API_KEY;
    if (REASONING_PROVIDER) process.env.REASONING_PROVIDER = REASONING_PROVIDER;
  }
}

/* ------------------------------------------------------------------ */
/* 3 — a full run, end to end                                          */
/* ------------------------------------------------------------------ */

async function testFullRun() {
  section('3. Full run: URL -> proposal (fixture: karoseria-hronec)');

  const args = parsePipelineArgs(['--fixture', 'karoseria-hronec', '--emails', '3']);
  const run = await runPipeline({ ...args, source: 'test' });

  if (!run.ok) {
    check('pipeline completes', false, run.reasons.join(' | '));
    return null;
  }
  check('pipeline completes', true);

  // Verified business problem.
  check('problem is grounded in a quote from the site', run.problem.evidence.length > 0);
  const corpus = run.snapshot.pages.map((p) => p.text).join(' ').toLowerCase();
  check('the quote really appears in the fetched pages',
    run.problem.evidence.every((e) => corpus.includes(e.quote.slice(0, 40).toLowerCase())));

  // Automation workflow.
  check('recommended workflow has 4+ steps', run.winner.workflow_steps.length >= 4);
  check('workflow has a trigger', run.winner.workflow_steps.some((s) => s.actor === 'trigger'));
  check('workflow has a human handoff', run.winner.workflow_steps.some((s) => s.actor === 'human'));
  check('workflow names a channel', run.winner.workflow_steps.some((s) => s.channel));
  check('the recommendation is the top-scored option',
    run.result.opportunities[0].id === run.result.recommended_opportunity_id);

  // Integrations.
  check('integrations are listed', run.winner.integrations.length > 0);

  // ROI estimate.
  check('every impact figure is flagged an estimate', run.demo.impact.every((e) => e.is_estimate === true));
  check('every impact figure is a range', run.demo.impact.every((e) => e.low < e.high));
  check('every impact figure carries assumptions', run.demo.impact.every((e) => e.assumptions.length >= 2));
  check('no impact figure claims to be measured', run.demo.impact.every((e) => e.confidence !== 'observed'));
  check('payback is an estimate too', run.payback.is_estimate === true);

  // Personalised outreach.
  check('--emails 3 produced three drafts', run.emails.length === 3, `${run.emails.length}`);
  check('all outreach is draft, nothing sent', run.emails.every((m) => m.status === 'draft'));
  check('every draft is grounded in the audit', run.emails.every((m) => m.grounding.length > 0));
  check('the first draft names the company or its site',
    run.emails[0].body.includes('karoseria-hronec') || run.emails[0].body.includes('Karos'));

  // Implementation blueprint.
  check('blueprint has per-step tests', run.blueprint.steps.every((s) => s.test.how && s.test.expect));
  check('blueprint has a deployment checklist', run.blueprint.deployment_checklist.length >= 8);
  check('blueprint stores credential names, never values',
    run.blueprint.credentials.every((c) => c.env_var.length > 0)
    && !/"value"\s*:/.test(JSON.stringify(run.blueprint.credentials)));
  check('blueprint matches the recommended template',
    run.blueprint.template_key === run.winner.template_key);

  return run;
}

/* ------------------------------------------------------------------ */
/* 4 — persistence                                                     */
/* ------------------------------------------------------------------ */

async function testPersistence(persisted: Awaited<ReturnType<typeof runPipeline>>) {
  section('4. Persistence');
  if (!persisted.ok) return;

  const verified = await verifyPersisted(persisted.persisted);
  check('every record reads back out of the store', verified.ok, verified.missing.join(', '));

  const store = await getStore();
  const lead = await store.getLead(persisted.persisted.lead_id);
  check('lead was enriched with contacts from the site', (lead?.contacts.length ?? 0) > 0);
  check('lead advanced to the audited stage', lead?.stage === 'audited', lead?.stage);

  const audit = await store.getAudit(persisted.persisted.audit_id);
  check('the stored audit carries its result', audit?.status === 'ok' && audit.result !== null);
  check('the stored audit links to the snapshot', audit?.snapshot_id === persisted.persisted.snapshot_id);

  const drafts = await store.listOutreach(persisted.persisted.lead_id);
  check('outreach drafts are stored against the lead',
    persisted.persisted.outreach_ids.every((id) => drafts.some((d) => d.id === id)));

  // Re-running must update the same lead, not create a duplicate.
  const before = (await store.listLeads()).length;
  const again = await runPipeline({
    ...parsePipelineArgs(['--fixture', 'karoseria-hronec']),
    source: 'test',
  });
  const after = (await store.listLeads()).length;
  check('re-running the same URL does not duplicate the lead', before === after, `${before} -> ${after}`);
  check('re-running reuses the same lead id',
    again.ok && again.lead.id === persisted.persisted.lead_id);
}

/* ------------------------------------------------------------------ */
/* 5 — failure paths                                                   */
/* ------------------------------------------------------------------ */

async function testFailures() {
  section('5. Failure paths');

  // A site with no usable content must fail cleanly, with the failure stored.
  const emptyFetcher: Fetcher = async () => ({
    status: 200,
    html: '<!doctype html><html><head><title>Placeholder</title></head><body><h1>Coming soon</h1></body></html>',
  });
  const thin = await runPipeline({
    ...parsePipelineArgs(['https://placeholder-site.example', '--country', 'SK']),
    fetcher: emptyFetcher,
    source: 'test',
  });
  check('a contentless site fails instead of inventing a proposal', !thin.ok);
  if (!thin.ok) {
    check('a readable but thin page fails at the audit stage, not the crawl stage',
      thin.stage === 'audit', thin.stage);
    check('the failure gives a reason', thin.reasons.length > 0, thin.reasons[0]);
    check('the failure gives the operator a next step', thin.hint.length > 20);
    check('the lead is still saved so the attempt is not lost', (thin.lead?.id.length ?? 0) > 0);

    const store = await getStore();
    const stored = thin.audit ? await store.getAudit(thin.audit.id) : null;
    check('the failed audit is stored, not discarded', stored !== null);
    check('the stored audit is not marked ok', stored?.status !== 'ok', stored?.status);
  }

  // A blocked fetch (bot protection, firewall, outbound proxy) must NOT be
  // reported as "this business publishes nothing" - that misdiagnosis sends the
  // operator looking at the wrong thing.
  for (const [status, label] of [[403, 'bot protection / proxy'], [404, 'wrong URL'], [503, 'server error']] as const) {
    const blocked: Fetcher = async () => ({ status, html: '' });
    const out = await runPipeline({
      ...parsePipelineArgs(['https://blocked.example']),
      fetcher: blocked,
      source: 'test',
    });
    check(`HTTP ${status} (${label}) fails at the crawl stage, not the audit`,
      !out.ok && out.stage === 'crawl', !out.ok ? out.stage : 'succeeded');
    if (!out.ok) {
      check(`HTTP ${status} says the page could not be read`, /HTTP /.test(out.reasons[0]), out.reasons[0]);
      check(`HTTP ${status} does not blame the business`,
        !/placeholder|no readable text|publishes nothing/i.test(out.hint));
      check(`HTTP ${status} saves nothing`, out.lead === null && out.audit === null);
    }
  }

  const emptyBody: Fetcher = async () => ({ status: 200, html: '   ' });
  const blank = await runPipeline({
    ...parsePipelineArgs(['https://blank.example']),
    fetcher: emptyBody,
    source: 'test',
  });
  check('a 200 with an empty body also fails at the crawl stage',
    !blank.ok && blank.stage === 'crawl');

  // A fetcher that throws must surface, not hang or silently pass.
  const brokenFetcher: Fetcher = async () => {
    throw new Error('ECONNREFUSED');
  };
  let surfaced = false;
  try {
    await runPipeline({
      ...parsePipelineArgs(['https://unreachable.example']),
      fetcher: brokenFetcher,
      source: 'test',
    });
  } catch (err) {
    surfaced = err instanceof Error && /ECONNREFUSED/.test(err.message);
  }
  check('an unreachable site surfaces the network error', surfaced);
}

/* ------------------------------------------------------------------ */

async function main() {
  await rm(DATA_FILE, { force: true });
  console.log('Pipeline tests (offline fixtures, isolated data file)');

  testArgs();
  testProvider();
  const run = await testFullRun();
  if (run) await testPersistence(run);
  await testFailures();

  // A second fixture, to prove the pipeline is not tuned to one site.
  section('6. A second, very different business (fixture: praxis-lindner)');
  const clinic = await runPipeline({
    ...parsePipelineArgs(['--fixture', 'praxis-lindner']),
    source: 'test',
  });
  check('the clinic also produces a complete proposal', clinic.ok);
  if (clinic.ok) {
    check('does not re-sell booking the clinic already runs',
      !clinic.result.opportunities.some((o) => o.template_key === 'ai_receptionist'));
    check('does not re-sell support chat the clinic already runs',
      !clinic.result.opportunities.some((o) => o.template_key === 'support_faq'));
    check('reaches a different recommendation than the auto shop',
      clinic.winner.template_key !== run?.winner.template_key,
      `${run?.winner.template_key} vs ${clinic.winner.template_key}`);
  }

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  await rm(DATA_FILE, { force: true });
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
