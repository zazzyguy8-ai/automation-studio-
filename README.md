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

## The web UI

```bash
npm run seed                   # three example businesses + one live client
npm run dev                    # http://localhost:3000
```

- **Run an audit** — paste a URL, get the audit.
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

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the stack rationale, the
n8n division of labour, and what was deliberately left out.
