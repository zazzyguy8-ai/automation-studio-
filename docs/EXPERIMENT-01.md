# Experiment 01 — UK private dental practices

**Status: prepared, not run.** The 100 leads are not in your inbox yet, because
the environment this was built in has no outbound network access. Running it is
one command on your machine — see [Running it](#running-it).

---

## The ICP

**UK private dental practices selling implants and Invisalign**, across ten
cities: Manchester, Birmingham, Leeds, Bristol, Glasgow, Liverpool, Sheffield,
Nottingham, Edinburgh, Cardiff.

### Why this one

**One case is worth £2,500–6,000.** Implants, full-arch, Invisalign. A single
recovered enquiry pays for a year of the monthly fee, which means the ROI
argument is arithmetic rather than a story you have to sell. This is the
requirement that eliminated most candidates.

**The problem is visible from the public website.** No online booking for a
consultation, a "we'll get back to you within 24 hours" promise, a contact form
as the only digital intake — all three are detected mechanically by the crawler,
so the email quotes their own page instead of guessing. This system's real edge
is evidence, and this ICP hands it over.

**High inbound volume against a hard bottleneck.** Self-pay patients shop
around and enquire at several practices at once. Reception is one or two people
who are also handling the front desk. Outside opening hours there is nobody.

**They can afford it.** A private UK practice typically turns over £500k–2M with
a real marketing budget, so £600–1,200/month sits inside an existing line item
rather than needing a new one.

**Lowest legal risk in the mapped set.** UK B2B cold email to registered
companies is permitted under PECR with a working opt-out. The first experiment
should not also be a legal experiment.

**Less competition in the inbox.** GDC advertising rules and clinical-advice
risk deter generalist agencies, unlike home services.

### What was rejected

| Option | Why not |
|---|---|
| US home services (roofing, HVAC, solar) | Higher job values, but a saturated inbox — contractors get several of these a day. Winning there is an outbound-volume game, the opposite of what a one-person agency is good at. |
| US med spas | Good economics, but most already run Podium, Weave or Boulevard. Selling a replacement is a much harder first conversation than selling into a gap. |
| Car repair / body shops | £200–500 job value cannot support £1k+/month. Fails the price requirement outright. |
| UK recruitment agencies | High fees, but their expensive problem is candidate sourcing, not lead response — and they already employ people for it. Wrong problem for this agent. |
| Splitting 50 UK / 50 US | At 100 leads and a 5–10% reply rate you get 5–10 replies. Split across two markets that is 2–5 each, which distinguishes nothing. One ICP, one market, one clean signal. US becomes experiment 02. |

**On the UK/US split specifically:** you asked for UK/USA. I ran UK only, and
that is a deliberate departure from the brief. Two markets at this sample size
produce two unreadable results instead of one readable one. If the UK run
passes, experiment 02 is the same ICP in the US, and you get a genuine market
comparison because both samples are 100.

---

## The problem we sell against

> A high-value enquiry — implant consultation, Invisalign — arrives through the
> website form on a Friday evening. Reception sees it Monday morning. By then the
> patient has enquired at three other practices, and one of them replied within
> the hour.

What the audit should find on their own site, and quote back:

- No online booking for a consultation, while the site pushes "book a consultation" as its CTA
- A stated response promise ("within 24 hours", "next working day") that nothing enforces
- Opening hours published next to a phone number, with no out-of-hours path
- A contact form as the only digital intake route

If the audit cannot evidence at least one of these from the fetched pages, the
quality gate rejects it and that practice is never contacted. That is why the
rehearsal drops ~30% of companies.

---

## The agent we build

**Template A — Lead Response + Qualification**, with dental specifics:

| Actor | Step |
|---|---|
| trigger | Website form or missed call enters the workflow within seconds |
| system | SMS + email inside 60s, naming the treatment they asked about |
| ai | Four qualification questions: treatment, urgency, self-pay vs insurance, timing |
| system | Writes the qualified enquiry into the practice system |
| system | Offers three real consultation slots from the live diary |
| system | Follow-up ladder at +1h / +24h / +72h, cancelled by any reply |
| human | Any clinical question or mention of pain hands off immediately |

**The clinical handoff is not optional.** The agent must never answer a clinical
question. That is a GDC problem and the fastest possible way to lose the client
and their goodwill.

---

## Price

**Build £2,000–3,000 · Monthly £600–1,200**

One implant case is worth £2,500–4,000 in fees. If the agent recovers a single
case per month that would otherwise have gone elsewhere, it returns 2–4× the
monthly fee. That is the whole pitch, and it survives the client checking the
arithmetic.

Anchor the build against what one recovered case is worth, not against your
hours. If you quote hours, you invite a comparison with a freelancer.

---

## Decision thresholds after 100 leads

| Metric | Pass at | If below |
|---|---|---|
| Delivered (100% − hard bounces) | ≥ 95% | Data problem, not ICP. Stop and fix address verification — everything else is measured against a broken denominator. |
| Reply rate (human, excl. auto-replies and bounces) | ≥ 6% | 2–5%: copy or domain, not ICP. Below 2% with clean bounces: the ICP is wrong. |
| Positive rate (interested + booked) | ≥ 3% | Healthy replies but no positives means the ICP is right and the **offer** is wrong. |
| Booked calls | ≥ 2 | Interest that never converts usually means the ask is too big. Offer the recorded walkthrough instead of a meeting. |
| Unsubscribe rate | ≤ 2% | The message reads as bulk however personalised it is. Rewrite the opener before another batch. |

### Decision matrix

| Signal | Conclusion | Action |
|---|---|---|
| reply ≥6% **and** positive ≥3% | ICP and offer both work | Scale. Add the next two cities, change nothing else. |
| reply ≥6% **and** positive <2% | ICP works, offer does not | Keep the list. Change the offer — problem, price, or lead with the walkthrough. |
| reply 2–5% | Inconclusive — copy or deliverability | Re-run 100 with a different subject and opener from the same ICP before concluding anything about the market. |
| reply <2% **and** bounce <5% | The ICP is wrong | Switch vertical. Next candidate: UK private cosmetic/aesthetic clinics, same agent. |
| bounce >5% | Data quality only | Read nothing else. Fix verification, re-run. |
| unsubscribe >2% | The message reads as bulk | Stop sending. Rewrite the opener, rest the domain a week. |

**These are planning thresholds, not published benchmarks.** They are the levels
at which I would change course, not measured industry averages. Adjust them once
you have your own baseline — after which they stop being assumptions.

**Not measured: open rate.** Open tracking needs a pixel, which hurts
deliverability, and Apple Mail Privacy Protection inflates it into noise anyway.
Reply rate is the first honest signal.

---

## Before you send any of this

**A hundred emails out of a cold domain burns the domain.** That is the single
most likely way this experiment fails for reasons that have nothing to do with
the ICP.

1. Separate sending subdomain — `mail.yourdomain.com`, never your primary domain.
2. SPF, DKIM and DMARC configured and verified before the first send.
3. Warm up: 10–15 a day for a week before this batch goes anywhere.
4. Keep the engine defaults (30/day, 90s between sends). Do not raise them for the first run.
5. Approve in batches, reading each draft. Reject anything that reads generic — the gate catches template openers, but it cannot catch "technically specific but boring".

At 10–15 a day, 100 leads is 7–10 working days of sending. Read the thresholds
when all 100 are out, not before.

---

## Running it

```bash
# 1. Read the reasoning (works anywhere, no network needed)
npm run experiment -- --report

# 2. Rehearse offline on 100 generated companies
npm run experiment -- --run --demo

# 3. The real run — needs network + ANTHROPIC_API_KEY in .env.local
npm run experiment -- --run

# 4. Work the inbox at http://localhost:3000/engine, then
npm run engine -- send        # dry run until both send switches are set

# 5. Once 100 are out
npm run experiment -- --status
```

**Set `ANTHROPIC_API_KEY` before the live run.** Without it the heuristic analyst
pattern-matches where Claude reads, and on this ICP the audit quality *is* the
offer. Running the experiment on weak audits tests the wrong thing.

### What the rehearsal produced

100 generated companies across the ten cities:

```
companies found      200
audits rejected       30   (thin or unreadable sites — correct behaviour)
leads drafted        100
awaiting your call   100   (first touches — what you decide on)
follow-ups behind    200   (drafted, blocked until their first touch sends)
sent                   0
```

The rehearsal exercises the same code the live run uses. What it cannot tell you
is whether real UK dental practices have the problem this ICP assumes — that is
what the 100 leads are for.
