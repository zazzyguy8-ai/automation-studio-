-- Pricebird schema. Idempotent: safe to run against a live database.
--
-- Three tables and nothing else. There is no photos table on purpose - images
-- are sent to the model and dropped, never written down.

create table if not exists accounts (
  id                     uuid primary key,
  email                  text unique,
  plan                   text not null default 'free' check (plan in ('free', 'pro')),
  stripe_customer_id     text unique,
  stripe_subscription_id text,
  subscription_status    text,
  current_period_end     timestamptz,
  created_at             timestamptz not null default now()
);

create table if not exists listings (
  id         uuid primary key,
  account_id uuid not null references accounts(id) on delete cascade,
  platform   text not null,
  listing    jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists listings_account_created_idx
  on listings (account_id, created_at desc);

-- One live code per address; a new request replaces the old one rather than
-- leaving several valid codes in flight.
create table if not exists login_codes (
  email      text primary key,
  code_hash  text not null,
  expires_at timestamptz not null,
  attempts   integer not null default 0
);
