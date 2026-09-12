# Pricebird

**Snap it. Price it. List it.** — [pricebird.org](https://pricebird.org)

Photograph anything you are selling. Pricebird reads the photo and gives back a
price range plus the listing to go with it: title, description and search
keywords, sized and worded for eBay, Vinted, Depop, Facebook Marketplace,
Poshmark, Mercari or Etsy.

It is a consumer micro-SaaS: five listings free with no signup, then $9 a month.

## 60 seconds to a running app

```bash
cd products/pricebird
npm install
echo "SESSION_SECRET=$(openssl rand -hex 32)" > .env.local
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env.local
npm run dev
```

With no `DATABASE_URL` everything is written to `.data/pricebird.json`. That is
fine on a laptop and is not a production database.

Check a prompt change against a real photo without clicking through the UI:

```bash
npm run listing -- ./jacket.jpg --platform ebay --currency GBP
```

## Tests, none of which need a key

```bash
npm test          # typecheck + both suites
```

`test:listing` stubs the API transport and asserts the things that cost money
when they break: that the photo actually reaches the model as an image block,
that a truncated response is reported as an output-budget problem rather than a
schema failure, that a refusal is explained in words a seller can act on, and
that every platform title limit is enforced in code rather than asked for in a
prompt.

`test:quota` covers the free wall, the monthly window, the Stripe status
mapping (a `past_due` card must not lock a paying customer out) and the account
merge that happens when someone who used the free tier on their phone signs in
on a laptop.

## The three rules the product is built on

**It will not invent a size.** If the label is not readable in the photo,
`size_on_label` is null and the question goes into `ask_the_seller`. A made-up
size produces a return, and a return costs the seller far more than a slow sale.

**It will not pretend to have checked sold listings.** The price is an estimate
from the photo and typical resale bands. `basis` says so in the seller's own
terms and `confidence` drops to low whenever the brand is unknown.

**It will not keep the photos.** Images are sent to the model and dropped.
Only the listing text is stored. There is no photos table in `db/schema.sql`
and adding one should require an argument.

## Going live

1. **Database.** Any Postgres. `DATABASE_URL=...` then `npm run db:push`.
2. **Stripe.** Two recurring prices ($9/month, $79/year) into
   `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_YEARLY`. Add the webhook endpoint
   `https://yourdomain/api/billing/webhook` for `checkout.session.completed`
   and the three `customer.subscription.*` events, and put its signing secret
   in `STRIPE_WEBHOOK_SECRET`. **Nothing upgrades an account except a verified
   webhook** — the success URL is a GET anyone can visit.
3. **Email.** A Resend key and a verified sender, or sign-in codes cannot be
   delivered and nobody can reach their account from a second device.
4. **`SESSION_SECRET`.** 32+ characters. Without it the app refuses to start a
   session rather than signing cookies with something guessable.
5. **Deploy.** Vercel, project root `products/pricebird`. `maxDuration` on the
   listing route is 60s because vision plus copy runs 10–25s.

`npm run build` fails loudly on a missing `SESSION_SECRET`; the billing and
mail modules list every missing variable by name rather than 500-ing.

## Cost per listing

One Sonnet call with one to four downscaled images and ~700 output tokens:
roughly two cents at list price, less with caching of the system prompt. The
300/month fair-use cap on Pro exists to bound a runaway script, not to upsell —
at $9 a month it leaves room even for someone who genuinely lists ten items a
day.

## Layout

```
src/lib/listing/    platforms (limits), schema (contract), prompts, generate (the call)
src/lib/billing/    plans and Stripe; the webhook is the only writer of `plan`
src/lib/db.ts       one store interface, Postgres and a JSON file behind it
src/lib/auth.ts     signed-cookie sessions and six-digit email codes
src/app/            landing, /app (the tool), /pricing, /signin, /account, API routes
```
