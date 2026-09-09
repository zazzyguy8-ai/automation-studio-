-- How far down the pipeline a campaign is allowed to go.
--
-- Added after the fact, so existing campaigns must keep the behaviour they
-- already had: the default and the backfill are both 'email', which is what
-- every campaign written before this column did.
alter table campaigns
  add column if not exists outreach_mode text not null default 'email'
  check (outreach_mode in ('contacts_only', 'research_only', 'email'));
