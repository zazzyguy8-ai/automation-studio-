# Automation Studio

Internal OS for a one-person AI automation agency.

You find a company. This turns their URL into a specific automation proposal —
their problem, quoted from their own website; the workflow that fixes it; the
integrations; an ROI estimate that is honest about being an estimate; and the
outreach to send. When they buy, it produces the build plan.

Not a SaaS. No auth, no tenancy, no billing. It is your tool.

## 60 seconds to your first proposal

```bash
npm install
npm run pipeline -- --fixture karoseria-hronec     # offline, no keys needed
```

That prints a complete proposal for a fictional Slovak auto body shop.

### Turn on Claude

Real audits need a key. Put it in `.env.local` — gitignored, and the only place
it belongs:

```bash
cp .env.example .env.local
# then edit .env.local:
#   ANTHROPIC_API_KEY=sk-ant-...
```

Both the web app and the CLI read it from there. The CLI prints which brain it
is running before it starts, so a missing key is obvious immediately:

```
reasoning: anthropic (claude-opus-5)          # key found
reasoning: heuristic (no ANTHROPIC_API_KEY…)  # falling back
```

Then, for a real company:

```bash
npm run pipeline -- https://theircompany.sk --industry "auto repair" --country SK
```

Without a key a deterministic signal-driven analyst runs instead, so nothing is
blocked — but it pattern-matches where Claude reads. Set the key.

Never paste a key into a chat, a commit, or a code comment. If one is ever
exposed, rotate it at console.anthropic.com — the old one keeps working until
you do.

## Lead discovery (global, priority UK / US / DACH / Nordics)

Industry + country/city in, verified companies out:

```bash
npm run discover -- --industry "car repair" --country GB --city Manchester
npm run discover -- --industry Zahnarzt --country DE --city Munich --limit 10
npm run discover -- --industry "car repair" --country GB --city Manchester --offline
```

**Sources.** OpenStreetMap (Nominatim + Overpass) is the default: worldwide, no
API key, and every record has a public URL you can open and check. Set
`GOOGLE_PLACES_API_KEY` and Places is used instead — better coverage in the US
and UK, at the cost of a card and Google's terms. Pick explicitly with
`--provider overpass|google_places`.

**Industry matching is multilingual.** `car repair`, `autoservis`,
`Autowerkstatt`, `bilverkstad` and `Immobilienmakler` all resolve, including
German and Nordic compound words — otherwise the priority markets would only
work in English.

**Nothing is asserted without a source.** Every company carries the URL it came
from. Contacts are never guessed — there is no `info@domain.com` construction
anywhere in the codebase. A contact is either found on the company's own site
(`found_on_site`, with the page it appears on) or listed in the directory
(`from_directory`, a weaker claim the UI labels as such). Companies whose site
cannot be read are not saved, and the reason is shown.

### Market regimes differ, and the system knows it

Cold email that is routine in the UK is a legal problem in Germany. Each market
carries its own risk level, note and required message elements:

| Market | Risk | Why |
|---|---|---|
| GB, US, IE | low | PECR / CAN-SPAM permit B2B with a working opt-out |
| CH, SE, NO, FI, NL | medium | permitted in practice, tighter conditions |
| **DE, AT, DK** | **high** | prior consent required even B2B (UWG §7, TKG §174, Markedsføringsloven §10) |
| unmapped | high | conservative default until you check |

On a high-risk market, approval is **refused** unless you tick the box
acknowledging the regime. The note is shown next to the button, so it is
impossible to approve a German cold email without having read why it is riskier
than a British one.

This is an operational signal, not legal advice. For DE/AT/DK the safer routes
are usually the phone, the company's own contact form, or LinkedIn.

### Approval is always yours

Discovery only fills the pipeline at stage `new`. Audits, demos and drafts are
separate, deliberate steps. Nothing is ever sent by this system: you approve a
draft, send it yourself, then mark it sent. Approval stays blocked on messages
with no grounding, that never name the company, or that open with a template
line — market acknowledgement does not override those.

## The outreach engine

Runs the loop end to end and stops at your inbox:

```bash
npm run engine -- daily --demo   # find 50, audit, rank, draft into the inbox
npm run engine -- status         # dashboard
npm run engine -- send           # send what YOU approved (dry run by default)
npm run engine -- stop "reason"  # kill switch
npm run engine -- start
```

Or drive it from `/engine`.

**One boundary, and it does not move: the engine never approves anything.** It
removes the research and the writing; it does not remove the decision about who
gets contacted. Each daily run discovers companies, audits them, ranks by
opportunity score plus how contactable they are, and drafts a first touch and
two follow-ups. They sit as drafts until you approve them.

**Sending is a dry run until you flip two switches.** Set `RESEND_API_KEY` *and*
`OUTREACH_SENDING_ENABLED=true`. Two, because "it started emailing real
companies" is not a mistake you get to make twice.

### Guards, checked per message and not per run

| Guard | Behaviour |
|---|---|
| Kill switch | Nothing sends. Checked before every individual message, and reported even when the queue is empty. |
| Daily cap | Default 30. Halts the run. |
| Per-run cap | Default 8. |
| Minimum gap | Default 90s between sends. |
| Quiet hours | Default 20:00–08:00, wrapping midnight correctly. |
| Suppression | Checked at draft time *and* again at send time, because an opt-out can arrive in between. |
| Approval | Only `approved` messages are picked up, ever. |

### Follow-ups

Two, at +3 and +5 days, and they are **drafts** as well — the timing is
automated, the decision is not. Any reply, unsubscribe or bounce cancels every
unsent message in the thread. An out-of-office deliberately does not: it is not
a reply, and stopping on one would silently kill working sequences.

### Replies

Classified by auditable rules rather than a model call, because the consequential
cases (unsubscribe, bounce) must never depend on an API being up. Unsubscribes
and hard bounces go on the suppression list automatically; everything else lands
in the reply inbox for you.

### SMS and voice

Architecture only, on the same `ChannelAdapter` interface, and they report
themselves unavailable with the reason. What is outstanding is not code: number
provisioning and sender registration, STOP keyword handling, recording consent,
do-not-call register checks, and a per-country legality decision. Both are far
more restricted than email in the priority markets — their natural home is a
client's inbound agent, not your outbound prospecting.

## The web UI

```bash
npm run seed                   # three example businesses + one live client
npm run dev                    # http://localhost:3000
```

- **Run an audit** — paste a URL, get the audit.
- **Outreach engine** (`/engine`) — kill switch, rate limits, approval inbox, reply inbox, suppression list, funnel.
- **Find companies** (`/discover`) — industry + country/city, with every source URL shown.
- **Leads** — the pipeline: New → Audited → Contacted → Replied → Call → Proposal → Won/Lost.
- **Lead detail** — the whole sales artefact on one page: enrichment, problems
  with quotes, scored options, the recommended workflow, Before/After, the demo
  script, the outreach drafts and their approval state.
- **Clients** — dashboard per client: executions, leads handled, appointments,
  follow-ups, handoffs, errors, and estimated time/revenue/ROI.
- **Agents** — build steps with per-step tests, credential checklist, guardrails,
  deployment checklist, and the n8n workflow export.

## Selling with it

1. Find a company. Paste the URL. Wait ~40 seconds.
2. Read the audit. You now know something specific about their business.
3. Build the demo. Record a 90-second screen capture reading the generated
   script — it uses their service names and their own wording.
4. Draft outreach, read it, approve it, send it from your own inbox, mark it sent.
   Approval is blocked on anything ungrounded or template-shaped.
5. Won → create the client, pick the template (their audit's recommendation is
   preselected), download the n8n workflow, work the deployment checklist.
6. Every step has a test. Go-live is refused until every credential is in place
   and every step passes.

Pricing this supports: €1–3k build plus €200–1,000/month management. Enter both
on the client and the dashboard estimates ROI against the monthly fee.

## Agent templates

| | Template | Use when |
|---|---|---|
| A | Lead Response + Qualification | Enquiries land in an inbox with no enforced response time |
| B | AI Receptionist / Booking | Appointments are arranged by phone; no online booking |
| C | Missed Call → SMS | Phone is the main intake and calls go unanswered |
| D | Lead Follow-up / Reactivation | A dormant list nobody contacts |
| E | Quote Follow-up | Quotes are sent, then chased from memory |
| F | Review Request | Reviews are left to chance |
| G | Customer Support / FAQ | The same questions answered by hand all day |
| H | Internal Admin / Data Entry | Details retyped from email into another system |

Each carries its steps, integrations, credential names, per-step tests, human
handoff rules, guardrails and a deployment checklist.

## Honesty rules, enforced in code

These are the constraints that make the output worth sending to a stranger:

- **No generic proposals.** An audit is rejected if an opportunity is fewer than
  4 steps, has no trigger, has no human handoff, names no channel or integration,
  or has a title that says nothing once filler is removed.
- **No unsupported claims.** Every problem must quote text that is actually
  present in the pages fetched. Quotes that cannot be found fail the audit.
- **Nothing you already have.** Proposing online booking to a site running
  Calendly, or a support agent to a site running live chat, fails the audit.
- **No fake numbers.** Every impact figure is a range carrying `is_estimate` and
  its assumption list. The only component that can render one always prints all
  three. There is no way to show a bare number as a fact.
- **No spam.** Outreach is drafted, never sent. Approval is blocked on messages
  with no grounding, that never name the company, that run long, or that open
  with a template line.
- **No plaintext secrets.** The credentials table has no value column. The API
  refuses requests carrying one. Values live in the secret store only.

A rejected audit is stored with its reasons and shown to you — the failure is
visible rather than silently degraded.

## Commands

| | |
|---|---|
| `npm run dev` | Web UI |
| `npm run pipeline -- <url>` | URL → full proposal in the terminal |
| `npm run pipeline -- --fixture <name>` | Offline demo run |
| `npm run discover -- --industry X --country GB` | Find and verify companies |
| `npm run engine -- daily\|send\|status\|stop\|start` | Outreach engine |
| `npm run test:engine` | Engine end to end over 50 demo leads |
| `npm run experiment -- --report\|--run\|--status` | Experiment 01 (see docs/EXPERIMENT-01.md) |
| `npm run test:discovery` | Discovery: taxonomy, markets, providers, verification, approval |
| `npm run seed` | Populate the local store |
| `npm test` | Typecheck + all three suites |
| `npm run test:pipeline` | Pipeline: args, provider, full run, persistence, failures |
| `npm run test:e2e` | Full spine over three fictional businesses |
| `npm run test:anthropic` | Claude request/response wiring, stubbed — no key needed |
| `npm run db:push` | Apply the migration to `DATABASE_URL` |
| `npm run typecheck` | `tsc --noEmit` |

### Pipeline options

```
npm run pipeline -- <url> [options]
npm run pipeline -- --fixture <name>

  --industry <text>     tunes the ROI assumption defaults
  --country <code>      e.g. SK, AT, CZ
  --fixture <name>      run offline (karoseria-hronec, praxis-lindner, novak-reality)
  --build-fee <eur>     one-off build fee for the payback estimate (default 1500)
  --monthly-fee <eur>   monthly management fee (default 300)
  --emails <n>          how many email drafts to generate (default 2)
```

A run saves the lead, snapshot, audit, demo and outreach drafts, and prints
their ids at the end. The blueprint is a preview and is **not** saved — an agent
belongs to a client, and a prospect who has not bought should not appear in your
client list. It is stored when you mark the lead won and create the agent.

Failures tell you which stage broke and what to do:

- **crawl** — the page could not be read (403 bot protection, 404, timeout).
  Nothing is saved, and the message does not blame the business.
- **audit** — the page was read but no proposal could be grounded in it. The
  lead and the failed audit are both kept so the attempt is not lost.

## Production

Put `DATABASE_URL` (Supabase → Project Settings → Database) in `.env.local` and
run `npm run db:push`. That is the only change — the store interface is
identical. Put the app behind auth before it holds client data.

[docs/EXPERIMENT-01.md](docs/EXPERIMENT-01.md) is the first outbound experiment:
the ICP, why it beat the alternatives, the offer, the price, and the exact
thresholds that decide after 100 leads whether to scale it or change it.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the stack rationale, the
n8n division of labour, and what was deliberately left out.
