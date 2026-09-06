-- Outreach engine: campaigns, replies, suppression list and engine state.

alter table outreach_messages
  drop constraint if exists outreach_messages_status_check;
alter table outreach_messages
  add constraint outreach_messages_status_check
  check (status in ('draft','approved','queued','sent','rejected','suppressed','cancelled','failed'));

alter table outreach_messages add column if not exists campaign_id  uuid;
alter table outreach_messages add column if not exists thread_id    uuid;
alter table outreach_messages add column if not exists scheduled_at timestamptz;
alter table outreach_messages add column if not exists sent_to      text;
alter table outreach_messages add column if not exists stop_reason  text;

create index if not exists outreach_thread_idx    on outreach_messages (thread_id);
create index if not exists outreach_sendable_idx  on outreach_messages (status, scheduled_at);

create table if not exists campaigns (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  industry        text not null,
  country         text not null,
  city            text,
  daily_target    int  not null default 50,
  daily_send_cap  int  not null default 20,
  build_fee_eur   numeric not null default 1500,
  monthly_fee_eur numeric not null default 300,
  status          text not null default 'active' check (status in ('active','paused')),
  created_at      timestamptz not null default now()
);

create table if not exists replies (
  id                    uuid primary key default gen_random_uuid(),
  lead_id               uuid not null references leads(id) on delete cascade,
  message_id            uuid references outreach_messages(id) on delete set null,
  channel               text not null check (channel in ('email','linkedin','instagram')),
  from_address          text not null,
  subject               text,
  body                  text not null,
  classification        text not null
                        check (classification in ('positive','booked','question','not_now','negative','unsubscribe','auto_reply','bounce')),
  classification_reason text not null,
  received_at           timestamptz not null default now(),
  handled               boolean not null default false
);
create index if not exists replies_lead_idx on replies (lead_id, received_at desc);

-- Append-only by intent: an entry here means "never contact again", and
-- removing one should be a deliberate, audited act rather than a routine write.
create table if not exists suppressions (
  id         uuid primary key default gen_random_uuid(),
  value      text not null,
  scope      text not null check (scope in ('address','domain')),
  reason     text not null check (reason in ('unsubscribe','complaint','hard_bounce','manual','never_contact')),
  note       text,
  created_at timestamptz not null default now(),
  unique (value, scope)
);

-- Exactly one row. The kill switch lives in the database rather than an env
-- var so it can be flipped from the UI and takes effect on the next send.
create table if not exists engine_state (
  id                        text primary key default 'singleton' check (id = 'singleton'),
  kill_switch               boolean not null default false,
  kill_switch_reason        text,
  counter_date              date    not null default current_date,
  sent_today                int     not null default 0,
  daily_send_cap            int     not null default 30,
  hourly_send_cap           int     not null default 8,
  min_seconds_between_sends int     not null default 90,
  quiet_hours_start         int     not null default 20,
  quiet_hours_end           int     not null default 8,
  last_sent_at              timestamptz,
  updated_at                timestamptz not null default now()
);
insert into engine_state (id) values ('singleton') on conflict (id) do nothing;
