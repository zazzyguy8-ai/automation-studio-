-- Automation Studio — core schema.
-- Nested LLM output (audit result, demo, blueprint) is stored as jsonb: it is
-- versioned by the app's zod schemas, not by DDL. Everything you filter or sort
-- on in the CRM gets a real column.

create extension if not exists pgcrypto;

create table if not exists leads (
  id            uuid primary key default gen_random_uuid(),
  company_name  text not null,
  website       text not null,
  industry      text,
  country       text,
  size_hint     text,
  stage         text not null default 'new'
                check (stage in ('new','audited','contacted','replied','call','proposal','won','lost')),
  contacts      jsonb not null default '[]'::jsonb,
  socials       jsonb not null default '[]'::jsonb,
  notes         text,
  source        text not null default 'manual',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists leads_website_key on leads (lower(website));
create index if not exists leads_stage_idx on leads (stage);
create index if not exists leads_country_industry_idx on leads (country, industry);

create table if not exists snapshots (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references leads(id) on delete cascade,
  root_url    text not null,
  pages       jsonb not null,
  signals     jsonb not null,
  fetched_at  timestamptz not null default now()
);
create index if not exists snapshots_lead_idx on snapshots (lead_id, fetched_at desc);

create table if not exists audits (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references leads(id) on delete cascade,
  snapshot_id uuid not null references snapshots(id) on delete cascade,
  model       text not null,
  status      text not null check (status in ('ok','rejected','error')),
  result      jsonb,
  gate_report jsonb not null default '[]'::jsonb,
  error       text,
  created_at  timestamptz not null default now()
);
create index if not exists audits_lead_idx on audits (lead_id, created_at desc);

create table if not exists demos (
  id            uuid primary key default gen_random_uuid(),
  audit_id      uuid not null references audits(id) on delete cascade,
  lead_id       uuid not null references leads(id) on delete cascade,
  headline      text not null,
  before_state  jsonb not null,
  after_state   jsonb not null,
  scenes        jsonb not null,
  impact        jsonb not null,
  impact_inputs jsonb not null,
  created_at    timestamptz not null default now()
);
create index if not exists demos_lead_idx on demos (lead_id, created_at desc);

create table if not exists outreach_messages (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references leads(id) on delete cascade,
  audit_id    uuid not null references audits(id) on delete cascade,
  channel     text not null check (channel in ('email','linkedin','instagram')),
  step        int  not null default 0,
  subject     text,
  body        text not null,
  status      text not null default 'draft'
              check (status in ('draft','approved','rejected','sent')),
  grounding   jsonb not null default '[]'::jsonb,
  approved_at timestamptz,
  sent_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists outreach_lead_idx on outreach_messages (lead_id, step);

create table if not exists clients (
  id                 uuid primary key default gen_random_uuid(),
  lead_id            uuid references leads(id) on delete set null,
  name               text not null,
  country            text,
  build_fee_eur      numeric,
  monthly_fee_eur    numeric,
  stripe_customer_id text,
  created_at         timestamptz not null default now()
);

create table if not exists agents (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references clients(id) on delete cascade,
  name         text not null,
  template_key text not null,
  status       text not null default 'draft'
               check (status in ('draft','testing','live','paused')),
  blueprint    jsonb not null,
  created_at   timestamptz not null default now()
);
create index if not exists agents_client_idx on agents (client_id);

-- Credential REFERENCES only. There is deliberately no `value` column here:
-- secrets live in the deployment environment (Vercel / n8n credential store /
-- Supabase Vault) and this table records only which ones exist and their state.
create table if not exists agent_credentials (
  id        uuid primary key default gen_random_uuid(),
  agent_id  uuid not null references agents(id) on delete cascade,
  provider  text not null,
  env_var   text not null,
  scope     text not null,
  required  boolean not null default true,
  status    text not null default 'missing'
            check (status in ('missing','configured','verified')),
  docs_url  text,
  unique (agent_id, env_var)
);

create table if not exists executions (
  id                     uuid primary key default gen_random_uuid(),
  agent_id               uuid not null references agents(id) on delete cascade,
  status                 text not null check (status in ('success','error','handoff')),
  outcome                jsonb not null,
  minutes_saved          numeric not null default 0,
  revenue_influenced_eur numeric not null default 0,
  error                  text,
  started_at             timestamptz not null default now()
);
create index if not exists executions_agent_idx on executions (agent_id, started_at desc);
