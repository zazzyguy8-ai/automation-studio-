# Deploying Snaplist

Four accounts, about fifteen minutes, and one command that tells you whether it
actually worked. Do them in this order — each step produces a value the next
one needs.

Nothing here can be done for you: every step is an account with your card
behind it.

---

## 0. Before anything: the name

Check the domain and run a trademark search for **Snaplist** in your market. If
it is taken, decide now — a rename after fifty videos costs you the audience.
Fallbacks that keep the meaning: Listsnap, Snapsell, Fliply.

## 1. Database — Neon or Supabase (free tier is enough)

Create a Postgres database and copy the connection string.

```bash
cd products/snaplist
cp .env.example .env.local
# put DATABASE_URL=... in .env.local
npm run db:push
```

`db:push` is idempotent, so re-running it on a live database is safe.

## 2. Claude key

console.anthropic.com → API keys. Put it in `.env.local` as
`ANTHROPIC_API_KEY`. Set a monthly spend limit while you are there; at roughly
two cents a listing you want to find out about a runaway loop from Anthropic,
not from your bank.

## 3. Stripe

Create the account, finish the business details so you can leave test mode,
then:

```bash
# STRIPE_SECRET_KEY=sk_test_... in .env.local first
npm run setup:stripe
```

It creates the product and the two prices ($9/month, $79/year) and prints
`STRIPE_PRICE_MONTHLY` and `STRIPE_PRICE_YEARLY`. It is idempotent — run it
again in live mode later and it makes the live copies without duplicating
anything.

The webhook comes after the deploy, because it needs the real URL.

## 4. Email — Resend

Add your domain, add the DNS records it gives you, wait for verification. Then
`RESEND_API_KEY` and `MAIL_FROM="Snaplist <hello@yourdomain.com>"`.

Without this, sign-in codes are refused in production and anyone who clears
their cookies loses their account. It is not optional once you have customers.

## 5. Session secret

```bash
echo "SESSION_SECRET=$(openssl rand -hex 32)" >> .env.local
```

## 6. Deploy to Vercel

Import the GitHub repository, then — the one setting people miss:

- **Root Directory: `products/snaplist`**

This repository holds two apps. Without that, Vercel builds the wrong one.

Add every variable from your `.env.local` to the Vercel project, plus
`APP_URL=https://yourdomain.com` (the real domain, `https://`, no trailing
slash). Deploy, then point the domain at it.

## 7. The webhook, now that a URL exists

```bash
# with APP_URL set to the deployed URL in .env.local
npm run setup:stripe -- --webhook
```

It prints `STRIPE_WEBHOOK_SECRET` **once**. Put it into Vercel and redeploy.

This is the step that decides whether money becomes access. Nothing but a
verified webhook may upgrade an account — the success URL is a page anyone can
open without paying.

## 8. Check it, twice

```bash
npm run doctor
```

Every line has to be `ok` — the key, the schema, both prices, the webhook
endpoint and its events, the verified sender. Then open
`https://yourdomain.com/api/health` in a browser to check the *deployed*
environment rather than your laptop's.

Finally, the only test that counts:

1. Make a listing on the live site with a real photo.
2. Subscribe with a real card.
3. Confirm `/account` says Pro **without you touching the database**.
4. Cancel from the billing portal and confirm it still works until the period ends.
5. Refund yourself in Stripe.

If step 3 needs a manual fix, the webhook is wrong. Fix that before you post a
single video.

---

## Going live in Stripe

Test-mode price IDs do not work in live mode. When you flip the switch:

1. Swap `STRIPE_SECRET_KEY` for the `sk_live_...` key in Vercel.
2. Re-run `npm run setup:stripe` and `npm run setup:stripe -- --webhook`
   against the live key — new price IDs, new webhook secret.
3. Update all three values in Vercel and redeploy.
4. `npm run doctor` again. It tells you when a price ID belongs to the other mode.

## Running costs at 100 subscribers

| | |
|---|---|
| Vercel | $0–20 |
| Postgres (Neon/Supabase) | $0–19 |
| Resend | $0 (3k emails free) |
| Claude | ~$40 at 40 listings each |
| **Revenue** | **$900** |
