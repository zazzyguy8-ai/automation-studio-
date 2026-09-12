# Deploying Pricebird

Host: **Render**. Database: **Supabase**. Domain: **pricebird.org** at Namecheap.

Work top to bottom — each step produces a value the next one needs. The last
step is the only one that proves any of it worked.

---

## The environment variables, in the order you will have them

This is the whole list. Ten names, and nothing else is read anywhere in the app.

| # | Name | Where it comes from | Without it |
|---|---|---|---|
| 1 | `SESSION_SECRET` | Render generates it (leave the field alone) | No session can be signed; the app refuses to start one |
| 2 | `APP_URL` | `https://pricebird.org` | Checkout has nowhere to return the customer to |
| 3 | `DATABASE_URL` | Supabase → Connect → Session pooler | Accounts vanish on every restart |
| 4 | `ANTHROPIC_API_KEY` | console.anthropic.com → API keys | No listing can be written at all |
| 5 | `STRIPE_SECRET_KEY` | Stripe → Developers → API keys (`sk_live_…`) | Nothing can be sold |
| 6 | `STRIPE_PRICE_MONTHLY` | Stripe → your product → the price row (`price_…`) | Nothing can be sold |
| 7 | `STRIPE_PRICE_YEARLY` | Same, once you create an annual price | Only the monthly plan shows. **Optional** |
| 8 | `STRIPE_WEBHOOK_SECRET` | Stripe → Webhooks → your endpoint (`whsec_…`) | Customers are charged and stay on the free plan |
| 9 | `RESEND_API_KEY` | resend.com → API keys | Sign-in codes are refused; a cleared cookie loses the account |
| 10 | `MAIL_FROM` | `Pricebird <hello@pricebird.org>` | Resend rejects the send |

Two optional extras: `VISION_MODEL` (defaults to `claude-sonnet-5`) and
`NODE_VERSION` (the blueprint sets 22).

`STRIPE_WEBHOOK_SECRET` is the one people skip, because everything looks fine
without it. It is the setting that turns money into access.

---

## 1. The domain — two jobs at Namecheap

Auto-renew is already on. The other one matters now:

**Delete the URL redirect.** The domain currently has `pricebird.org →
http://www.pricebird.org/` under *Redirect Domain*. That is Namecheap's parking
redirect and it will fight the real DNS records. Remove that row before step 5.

Canonical address is the apex, **https://pricebird.org**, with `www` redirecting
to it. That is what `APP_URL` says, and Stripe's return URLs have to match it
exactly.

## 2. Database — Supabase

Create the project, then **Connect** → **Session pooler** and copy the URI. Two
things about that string:

- Use the **session pooler**, not the direct connection. Render's instance
  reconnects on every deploy and Supabase's direct connections are limited.
- It contains your database password. It is a secret, like a key.

Then, from your laptop:

```bash
cd products/pricebird
cp .env.example .env.local          # put DATABASE_URL in it
npm run db:push
```

`db:push` is idempotent, so re-running it against a live database is safe.

## 3. Claude key

console.anthropic.com → API keys → `ANTHROPIC_API_KEY`. Set a monthly spend
limit while you are there. At roughly two cents a listing you want to hear about
a runaway loop from Anthropic, not from your bank.

## 4. Stripe

You already have the product and a $7/month price. Open it and copy the price
id — it starts with `price_`, and it is **not** the product id (`prod_`). That
is `STRIPE_PRICE_MONTHLY`.

An annual price is optional. If you want one, add $69/year to the same product
and set `STRIPE_PRICE_YEARLY`; leave it empty and the app simply does not show
the yearly button.

Branding (Settings → Branding), so checkout does not look like a stranger's:

- Brand colour `#07070a` — the app's own near-black.
- Accent colour `#2563eb` — the blue from the bird. White button text scores
  5.2:1 on it, which is why the accent is this blue and not the old lime, where
  it scored 1.15:1 and would have been unreadable on Stripe's buttons.
- Icon: the app icon at `src/app/icon.svg`. Logo: the jay.

The webhook comes in step 6, once a URL exists.

## 5. Email — Resend

Add `pricebird.org`, add the DNS records Resend gives you at Namecheap, wait for
verification. Then `RESEND_API_KEY` and
`MAIL_FROM="Pricebird <hello@pricebird.org>"`.

## 6. Render

Blueprint route: **New → Blueprint**, point it at this repository. `render.yaml`
at the repository root already carries the plan, the region, the build and
`rootDir: products/pricebird` — the setting that decides which of the two apps
in this repo gets built.

Render then asks for the secrets marked `sync: false`; paste in numbers 3–10
from the table. `SESSION_SECRET` it generates itself.

Manual route, if you prefer clicking: New → Web Service, **Root Directory
`products/pricebird`**, build `npm ci && npm run build`, start `npm start`, and
add every variable yourself.

Deploy. You get `pricebird.onrender.com` — check the site loads there before
touching DNS, so that a later problem is a DNS problem and nothing else.

## 7. Point the domain at it

In Render: Settings → Custom Domains → add `pricebird.org` and `www.pricebird.org`.
Render shows the exact records to create — an A record for the apex and a CNAME
for `www`. Copy the values it displays rather than any written down elsewhere;
they are per-service and they change.

At Namecheap: Domain List → Manage → **Advanced DNS**, delete the parking
records (the `URL Redirect` row and any CNAME to `parkingpage`), add what Render
showed, and leave the nameservers on Namecheap BasicDNS.

Propagation is usually minutes. Render issues the TLS certificate itself once
the records resolve.

## 8. The webhook, now that a URL exists

```bash
# APP_URL=https://pricebird.org in .env.local, live STRIPE_SECRET_KEY
npm run setup:stripe -- --webhook
```

It prints `STRIPE_WEBHOOK_SECRET` **once**. Put it into Render and redeploy.

Or by hand: Stripe → Webhooks → add `https://pricebird.org/api/billing/webhook`
listening for `checkout.session.completed` and the three
`customer.subscription.*` events.

## 9. Prove it

```bash
npm run doctor
```

Every line `ok` — the key, the schema, the price, the webhook endpoint and its
events, the verified sender. A yearly price you have not created shows as a
warning, which is fine.

Then open `https://pricebird.org/api/health`, which asks the same questions of
the deployed instance rather than your laptop.

Finally, the only test that counts:

1. Make a listing on the live site with a real photo.
2. Subscribe with a real card.
3. Confirm `/account` says Pro **without you touching the database**.
4. Cancel in the billing portal; confirm it keeps working to the period end.
5. Refund yourself in Stripe.

If step 3 needs a manual fix, the webhook is wrong. Fix that before you post a
single video.

---

## Running costs

| | Monthly |
|---|---|
| Render Starter | $7 |
| Supabase | $0 (free tier) |
| Resend | $0 (3k emails) |
| Domain | ~$0.75 amortised |
| Claude, at 100 subscribers × 40 listings | ~$40 |
| **Total at 100 subscribers** | **~$48** |
| **Revenue at 100 subscribers** | **$700** |

Before the first customer it is about $8 a month. The floor is low enough that
this can be wrong for a long time without hurting you.

## Going live in Stripe

Test-mode ids do not work in live mode. When you flip the switch: swap
`STRIPE_SECRET_KEY` for the `sk_live_…` key, re-copy the live price id, re-run
`npm run setup:stripe -- --webhook` against the live key for a new webhook
secret, update all three in Render, redeploy, and run `npm run doctor` again —
it tells you when a price id belongs to the other mode.
