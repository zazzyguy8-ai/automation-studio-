# Architecture

## The one thing this system does

```
company URL
   ↓  crawl public pages, detect signals mechanically
   ↓  audit: problems (each quoting their site) → 3-5 scored automations → pick one
   ↓  quality gate: reject anything generic, ungrounded, or that they already have
   ↓  demo: Before/After + script + impact estimates (ranges, assumptions attached)
   ↓  outreach: drafts grounded in that audit, human approves before anything is sent
   ↓  won → client → agent blueprint → credential + step gating → go live
   ↓  dashboard: measured counts, estimated value, clearly separated
```

Everything else was left out on purpose. See "What is deliberately missing".

## Stack, and where it differs from the brief

| Layer | Choice | Why |
|---|---|---|
| App | Next.js 15 (App Router) + TypeScript | One deployable, server components read the store directly, API routes for the mutations. As requested. |
| Data | Postgres (Supabase) via `pg` + plain SQL migration | No ORM. The schema is small and you should be able to read it. Nested LLM output lives in `jsonb`, versioned by zod rather than by DDL. |
| Local data | File-backed store behind the same interface | The whole pipeline runs before Supabase exists. Switching is one env var. |
| Reasoning | Claude via forced tool-use | Structured output validated by JSON Schema *and* zod before it can be stored. `claude-opus-5` for the audit, `claude-sonnet-5` for copy. |
| Fallback reasoning | Deterministic signal-driven analyst | Makes the pipeline runnable and the tests reproducible without an API key. It is a floor, not a substitute. |
| OpenAI | Not used | Nothing in the MVP needs it. The first place it would earn its keep is embeddings for lead similarity search, which is a later feature. |
| SMS / voice | Provider-agnostic in the blueprint; Telnyx as the EU default, Twilio as the fallback | Telnyx has better EU number coverage and pricing in most of the region; Twilio wins where Telnyx has no local numbers. The blueprint declares the capability and names the credentials for whichever you pick. |
| Billing | Stripe-ready, not Stripe-integrated | `clients` carries `stripe_customer_id`, `build_fee_eur`, `monthly_fee_eur`. Wiring Stripe before you have a paying client is work you do twice. |

## The one real architectural disagreement: what n8n is for

The brief asks for "n8n for orchestration where it makes sense". This system uses
it in a different place than that phrasing implies, and it matters:

**n8n does not orchestrate the OS. n8n is the runtime for the client's agent.**

The OS pipeline (crawl → audit → gate → demo → outreach) is a short-lived,
strongly typed, LLM-heavy function. Running it inside n8n would mean debugging
JSON in a GUI, no type checking, no diffable prompts, and no test suite. It runs
as TypeScript in this repo instead, where `npm run test:e2e` can assert on it.

What actually eats your delivery hours is the *client-side* workflow: webhooks,
retries, SMS providers, calendars, credential vaults, per-client isolation.
That is exactly n8n's job. So the blueprint generator emits an importable n8n
workflow scaffold — every node placed, named, connected, and annotated with the
test it has to pass — and you fill in parameters rather than assembling a canvas
from scratch.

```
Automation Studio (this repo)          n8n (per client)
─────────────────────────────          ────────────────────
reasoning, scoring, gating       →     execution, retries, webhooks
blueprint + credential contract  →     credential vault, node bindings
deployment checklist             →     the workflow you actually ship
```

If a later version needs long-running orchestration inside the OS itself
(scheduled re-audits, drip sends), that is a queue plus cron, not n8n.

## Where the quality actually comes from

Three components do the work that stops this being a generic AI wrapper:

**1. Mechanical signals (`src/lib/scrape/signals.ts`).**
Booking vendors, live chat widgets, contact forms, stated response promises,
phone numbers — detected by pattern-matching the fetched HTML, with no model
involved. This is the only layer allowed to produce facts labelled `observed`.

**2. The specificity gate (`src/lib/audit/gate.ts`).**
An audit is rejected — stored with its reasons, never shown to a prospect —
when any of these hold:

- an opportunity has fewer than 4 workflow steps
- no step is a `trigger` (the workflow has no entry point)
- no step is a `human` (no defined handoff)
- no step names a channel, or none names an integration
- a title carries no content once filler and the company name are removed
  ("Use an AI chatbot", "Implement automation to improve efficiency")
- a step states an intention rather than an action
- an evidence quote cannot be found in the pages actually fetched
- it proposes online booking to a site already running Calendly, or a support
  agent to a site already running live chat

**3. The estimate model (`src/lib/estimate/model.ts`).**
Every impact number is a range with `is_estimate: true` and its assumption list
attached. `EstimateCard` is the only component allowed to render one, and it has
no prop that suppresses the range, the marker, or the assumptions. There is no
code path that puts a bare confident number in front of a prospect.

Defaults per vertical exist only to make the first conversation less wrong. They
are labelled planning assumptions, not research findings, and the client's real
figures replace them on the first call.

## Secrets

Stated once, enforced in several places:

- `agent_credentials` has no column that could hold a value, by design.
- Blueprints record the credential **name**, provider, scope and state.
- `POST /api/agents/[id]/credentials` refuses any request carrying `value`,
  `secret` or `api_key`.
- The n8n export writes credential names into node config; n8n resolves them
  against its own vault at import.
- Values live in exactly one place per deployment: Vercel/Supabase env vars for
  the OS, the n8n credential store for the delivered workflow.

## Data model

`leads → snapshots → audits → demos → outreach_messages`, then
`clients → agents → agent_credentials / executions`.

Filterable fields are real columns. Nested LLM output is `jsonb`. The audit that
sold the deal stays linked to the client, so `buildBlueprint` can fold the
workflow you actually sold into the build plan.

## What is deliberately missing

Each of these is a real feature that was left out because it is not on the
critical path from URL to signed client:

- **Sending.** Outreach is drafted and approved here; you send it from your own
  inbox. Adding a sender means deliverability, warmup and suppression lists —
  a project of its own, and worth doing only once outreach is converting.
- **Lead search / scraping directories.** The brief asks for search by industry
  and country. Import by CSV and audit-by-URL are in; automated discovery is not,
  because the audit is the part that wins deals.
- **Live execution ingestion.** `executions` is written by the seed script today.
  The real path is an n8n HTTP node posting to this API at the end of each run —
  a small endpoint, once you have a live client to point at it.
- **Auth.** Single-operator tool. Put it behind Vercel password protection or a
  reverse proxy before it holds real client data.
- **Stripe.** Schema-ready, unwired.

## Known limits

- The file-backed store caches in process. Two Node processes writing at once
  will clobber each other. It is a local development convenience — set
  `DATABASE_URL` for anything real.
- The crawler reads static HTML. Sites that render entirely client-side will
  return thin content, and the audit will be correspondingly thin. A headless
  fetch is the fix when you hit one.
- The deterministic analyst pattern-matches; Claude reads. Expect noticeably
  better audits with `ANTHROPIC_API_KEY` set.
