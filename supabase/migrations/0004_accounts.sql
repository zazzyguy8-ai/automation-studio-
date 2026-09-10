-- Accounts and metered usage.
--
-- The data tables are NOT scoped by account in this migration. That is
-- deliberate and PgStore refuses any non-default account until they are:
-- adding an accounts table while leaving leads, outreach_messages and the rest
-- unscoped would produce a schema that looks multi-tenant and serves one
-- customer another customer's rows.

create table if not exists accounts (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  email                  text not null unique,
  plan                   text not null default 'trial'
                           check (plan in ('trial','starter','growth','agency')),
  subscription_state     text not null default 'trialing'
                           check (subscription_state in ('trialing','active','past_due','canceled')),
  stripe_customer_id     text unique,
  stripe_subscription_id text,
  current_period_end     timestamptz,
  created_at             timestamptz not null default now()
);

create index if not exists accounts_stripe_customer_idx on accounts (stripe_customer_id);

-- Counted rather than derived from the audits table, so the number survives
-- data being pruned and a usage check stays one read instead of a scan.
create table if not exists usage (
  account_id       uuid not null references accounts(id) on delete cascade,
  period           text not null,
  audits           int  not null default 0,
  leads_discovered int  not null default 0,
  messages_sent    int  not null default 0,
  updated_at       timestamptz not null default now(),
  primary key (account_id, period)
);
