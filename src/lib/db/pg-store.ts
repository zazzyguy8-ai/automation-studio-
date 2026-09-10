import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Pool } from 'pg';
import type {
  Account, Agent, Audit, Campaign, Client, Demo, EngineState, Execution, Lead, LeadStage,
  OutreachMessage, Reply, Snapshot, Suppression, Usage,
} from '@/lib/types';
import { DEFAULT_ACCOUNT_ID } from './file-store';
import { type LeadFilter, type NewOutreachMessage, type Store, nowIso } from './store';

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));

export class PgStore implements Store {
  /**
   * The account this store is scoped to.
   *
   * Only the default account is accepted, and the constructor refuses anything
   * else. The account registry below is scoped correctly, but the forty-odd
   * data methods on this class are not - they were written single-tenant and
   * still query without an account_id. Implementing the registry while leaving
   * those unscoped would produce a store that LOOKS multi-tenant and silently
   * serves one customer another customer's leads.
   *
   * So it fails loudly instead. A refused connection is a bug report; a
   * successful one that leaks data is a breach. Scoping these queries is the
   * next change, and until it lands Postgres stays single-tenant.
   */
  private accountId: string;

  private pool: Pool;
  private ready = false;

  constructor(connectionString = process.env.DATABASE_URL, accountId = DEFAULT_ACCOUNT_ID) {
    if (!connectionString) throw new Error('DATABASE_URL is required for PgStore');
    if (accountId !== DEFAULT_ACCOUNT_ID) {
      throw new Error(
        `PgStore cannot serve account "${accountId}": its data queries are not yet scoped by `
        + 'account, so returning rows would mean returning another account\'s data. Run on the '
        + 'file store for multi-account work, or scope the Postgres queries first.',
      );
    }
    this.accountId = accountId;
    this.pool = new Pool({
      connectionString,
      ssl: connectionString.includes('localhost') ? undefined : { rejectUnauthorized: false },
    });
  }

  async init() {
    if (this.ready) return;
    // Migrations are idempotent and applied in order, so init() is safe to
    // call on every cold start.
    for (const file of ['0001_init.sql', '0002_outreach_engine.sql']) {
      await this.pool.query(await readFile(join(process.cwd(), 'supabase/migrations', file), 'utf8'));
    }
    this.ready = true;
  }

  async close() {
    await this.pool.end();
  }

  private static lead(r: Record<string, unknown>): Lead {
    return {
      id: String(r.id),
      company_name: String(r.company_name),
      website: String(r.website),
      industry: (r.industry as string) ?? null,
      country: (r.country as string) ?? null,
      size_hint: (r.size_hint as string) ?? null,
      stage: r.stage as LeadStage,
      contacts: (r.contacts as Lead['contacts']) ?? [],
      socials: (r.socials as Lead['socials']) ?? [],
      notes: (r.notes as string) ?? null,
      source: String(r.source),
      created_at: iso(r.created_at),
      updated_at: iso(r.updated_at),
    };
  }

  async upsertLead(input: Omit<Lead, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<Lead> {
    const { rows } = await this.pool.query(
      `insert into leads (company_name, website, industry, country, size_hint, stage, contacts, socials, notes, source)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10)
       on conflict (lower(website)) do update set
         company_name = excluded.company_name,
         industry     = coalesce(excluded.industry, leads.industry),
         country      = coalesce(excluded.country, leads.country),
         size_hint    = coalesce(excluded.size_hint, leads.size_hint),
         contacts     = excluded.contacts,
         socials      = excluded.socials,
         notes        = coalesce(excluded.notes, leads.notes),
         updated_at   = now()
       returning *`,
      [input.company_name, input.website, input.industry, input.country, input.size_hint,
        input.stage, JSON.stringify(input.contacts), JSON.stringify(input.socials), input.notes, input.source],
    );
    return PgStore.lead(rows[0]);
  }

  async getLead(id: string) {
    const { rows } = await this.pool.query('select * from leads where id = $1', [id]);
    return rows[0] ? PgStore.lead(rows[0]) : null;
  }

  async findLeadByWebsite(website: string) {
    const { rows } = await this.pool.query('select * from leads where lower(website) = lower($1)', [website]);
    return rows[0] ? PgStore.lead(rows[0]) : null;
  }

  async listLeads(filter: LeadFilter = {}) {
    const { rows } = await this.pool.query(
      `select * from leads
        where ($1::text is null or company_name ilike '%'||$1||'%' or website ilike '%'||$1||'%')
          and ($2::text is null or stage = $2)
          and ($3::text is null or industry = $3)
          and ($4::text is null or country = $4)
        order by created_at desc`,
      [filter.q ?? null, filter.stage ?? null, filter.industry ?? null, filter.country ?? null],
    );
    return rows.map(PgStore.lead);
  }

  async setLeadStage(id: string, stage: LeadStage) {
    const { rows } = await this.pool.query(
      'update leads set stage = $2, updated_at = now() where id = $1 returning *', [id, stage]);
    if (!rows[0]) throw new Error(`lead ${id} not found`);
    return PgStore.lead(rows[0]);
  }

  async insertSnapshot(s: Omit<Snapshot, 'id'>) {
    const { rows } = await this.pool.query(
      `insert into snapshots (lead_id, root_url, pages, signals, fetched_at)
       values ($1,$2,$3::jsonb,$4::jsonb,$5) returning *`,
      [s.lead_id, s.root_url, JSON.stringify(s.pages), JSON.stringify(s.signals), s.fetched_at]);
    return { ...s, id: String(rows[0].id) };
  }

  async latestSnapshot(leadId: string) {
    const { rows } = await this.pool.query(
      'select * from snapshots where lead_id = $1 order by fetched_at desc limit 1', [leadId]);
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id: String(r.id), lead_id: String(r.lead_id), root_url: String(r.root_url),
      pages: r.pages, signals: r.signals, fetched_at: iso(r.fetched_at),
    } as Snapshot;
  }

  async insertAudit(a: Omit<Audit, 'id'>) {
    const { rows } = await this.pool.query(
      `insert into audits (lead_id, snapshot_id, model, status, result, gate_report, error, created_at)
       values ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8) returning id`,
      [a.lead_id, a.snapshot_id, a.model, a.status, a.result ? JSON.stringify(a.result) : null,
        JSON.stringify(a.gate_report), a.error, a.created_at]);
    return { ...a, id: String(rows[0].id) };
  }

  private static audit(r: Record<string, unknown>): Audit {
    return {
      id: String(r.id), lead_id: String(r.lead_id), snapshot_id: String(r.snapshot_id),
      model: String(r.model), status: r.status as Audit['status'],
      result: (r.result as Audit['result']) ?? null,
      gate_report: (r.gate_report as string[]) ?? [],
      error: (r.error as string) ?? null, created_at: iso(r.created_at),
    };
  }

  async getAudit(id: string) {
    const { rows } = await this.pool.query('select * from audits where id = $1', [id]);
    return rows[0] ? PgStore.audit(rows[0]) : null;
  }

  async latestAudit(leadId: string) {
    const { rows } = await this.pool.query(
      'select * from audits where lead_id = $1 order by created_at desc limit 1', [leadId]);
    return rows[0] ? PgStore.audit(rows[0]) : null;
  }

  async insertDemo(d: Omit<Demo, 'id'>) {
    const { rows } = await this.pool.query(
      `insert into demos (audit_id, lead_id, headline, before_state, after_state, scenes, impact, impact_inputs, created_at)
       values ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9) returning id`,
      [d.audit_id, d.lead_id, d.headline, JSON.stringify(d.before), JSON.stringify(d.after),
        JSON.stringify(d.scenes), JSON.stringify(d.impact), JSON.stringify(d.impact_inputs), d.created_at]);
    return { ...d, id: String(rows[0].id) };
  }

  async latestDemo(leadId: string) {
    const { rows } = await this.pool.query(
      'select * from demos where lead_id = $1 order by created_at desc limit 1', [leadId]);
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id: String(r.id), audit_id: String(r.audit_id), lead_id: String(r.lead_id),
      headline: String(r.headline), before: r.before_state, after: r.after_state,
      scenes: r.scenes, impact: r.impact, impact_inputs: r.impact_inputs,
      created_at: iso(r.created_at),
    } as Demo;
  }

  private static outreach(r: Record<string, unknown>): OutreachMessage {
    return {
      id: String(r.id), lead_id: String(r.lead_id), audit_id: String(r.audit_id),
      channel: r.channel as OutreachMessage['channel'], step: Number(r.step),
      subject: (r.subject as string) ?? null, body: String(r.body),
      status: r.status as OutreachMessage['status'], grounding: (r.grounding as string[]) ?? [],
      approved_at: r.approved_at ? iso(r.approved_at) : null,
      sent_at: r.sent_at ? iso(r.sent_at) : null, created_at: iso(r.created_at),
      campaign_id: (r.campaign_id as string) ?? null,
      thread_id: (r.thread_id as string) ?? null,
      scheduled_at: r.scheduled_at ? iso(r.scheduled_at) : null,
      sent_to: (r.sent_to as string) ?? null,
      stop_reason: (r.stop_reason as string) ?? null,
    };
  }

  async insertOutreach(m: NewOutreachMessage) {
    const { rows } = await this.pool.query(
      `insert into outreach_messages
         (lead_id, audit_id, channel, step, subject, body, status, grounding, created_at,
          campaign_id, thread_id, scheduled_at, sent_to, stop_reason)
       values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14) returning *`,
      [m.lead_id, m.audit_id, m.channel, m.step, m.subject, m.body, m.status,
        JSON.stringify(m.grounding), m.created_at,
        m.campaign_id ?? null, m.thread_id ?? null, m.scheduled_at ?? null,
        m.sent_to ?? null, m.stop_reason ?? null]);
    return PgStore.outreach(rows[0]);
  }

  async listOutreach(leadId: string) {
    const { rows } = await this.pool.query(
      'select * from outreach_messages where lead_id = $1 order by step asc', [leadId]);
    return rows.map(PgStore.outreach);
  }

  async setOutreachStatus(id: string, status: OutreachMessage['status'], patch: Partial<OutreachMessage> = {}) {
    const { rows } = await this.pool.query(
      `update outreach_messages set status = $2,
         approved_at  = case when $2 = 'approved' then now() else approved_at end,
         sent_at      = case when $2 = 'sent' then coalesce(sent_at, $8::timestamptz, now()) else sent_at end,
         sent_to      = coalesce($3, sent_to),
         stop_reason  = coalesce($4, stop_reason),
         scheduled_at = coalesce($5, scheduled_at),
         thread_id    = coalesce($6::uuid, thread_id),
         campaign_id  = coalesce($7::uuid, campaign_id)
       where id = $1 returning *`,
      [id, status, patch.sent_to ?? null, patch.stop_reason ?? null, patch.scheduled_at ?? null,
        patch.thread_id ?? null, patch.campaign_id ?? null, patch.sent_at ?? null]);
    if (!rows[0]) throw new Error(`outreach ${id} not found`);
    return PgStore.outreach(rows[0]);
  }

  async getOutreach(id: string) {
    const { rows } = await this.pool.query('select * from outreach_messages where id = $1', [id]);
    return rows[0] ? PgStore.outreach(rows[0]) : null;
  }

  async listSendable(now: string, limit: number) {
    const { rows } = await this.pool.query(
      `select * from outreach_messages
        where status in ('approved','queued')
          and (scheduled_at is null or scheduled_at <= $1)
        order by coalesce(scheduled_at, created_at) asc limit $2`, [now, limit]);
    return rows.map(PgStore.outreach);
  }

  async listOutreachByThread(threadId: string) {
    const { rows } = await this.pool.query(
      'select * from outreach_messages where thread_id = $1 order by step asc', [threadId]);
    return rows.map(PgStore.outreach);
  }

  async listOutreachByStatus(status: OutreachMessage['status'], limit = 200) {
    const { rows } = await this.pool.query(
      'select * from outreach_messages where status = $1 order by created_at desc limit $2', [status, limit]);
    return rows.map(PgStore.outreach);
  }

  async countOutreach() {
    const { rows } = await this.pool.query('select status, count(*)::int as n from outreach_messages group by status');
    const counts = {} as Record<OutreachMessage['status'], number>;
    for (const r of rows) counts[r.status as OutreachMessage['status']] = Number(r.n);
    return counts;
  }

  private static campaign(r: Record<string, unknown>): Campaign {
    return {
      id: String(r.id), name: String(r.name), industry: String(r.industry),
      country: String(r.country), city: (r.city as string) ?? null,
      daily_target: num(r.daily_target), daily_send_cap: num(r.daily_send_cap),
      build_fee_eur: num(r.build_fee_eur), monthly_fee_eur: num(r.monthly_fee_eur),
      // Rows written before the column existed read as null; 'email' is what
      // they behaved as, so that is what they keep behaving as.
      outreach_mode: (r.outreach_mode as Campaign['outreach_mode']) ?? 'email',
      status: r.status as Campaign['status'], created_at: iso(r.created_at),
    };
  }

  async insertCampaign(c: Omit<Campaign, 'id' | 'created_at'>) {
    const { rows } = await this.pool.query(
      `insert into campaigns (name, industry, country, city, daily_target, daily_send_cap,
                              build_fee_eur, monthly_fee_eur, outreach_mode, status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
      [c.name, c.industry, c.country, c.city, c.daily_target, c.daily_send_cap,
        c.build_fee_eur, c.monthly_fee_eur, c.outreach_mode, c.status]);
    return PgStore.campaign(rows[0]);
  }

  async listCampaigns() {
    const { rows } = await this.pool.query('select * from campaigns order by created_at desc');
    return rows.map(PgStore.campaign);
  }

  async getCampaign(id: string) {
    const { rows } = await this.pool.query('select * from campaigns where id = $1', [id]);
    return rows[0] ? PgStore.campaign(rows[0]) : null;
  }

  async setCampaignStatus(id: string, status: Campaign['status']) {
    const { rows } = await this.pool.query(
      'update campaigns set status = $2 where id = $1 returning *', [id, status]);
    if (!rows[0]) throw new Error(`campaign ${id} not found`);
    return PgStore.campaign(rows[0]);
  }

  private static reply(r: Record<string, unknown>): Reply {
    return {
      id: String(r.id), lead_id: String(r.lead_id),
      message_id: (r.message_id as string) ?? null,
      channel: r.channel as Reply['channel'], from_address: String(r.from_address),
      subject: (r.subject as string) ?? null, body: String(r.body),
      classification: r.classification as Reply['classification'],
      classification_reason: String(r.classification_reason),
      received_at: iso(r.received_at), handled: Boolean(r.handled),
    };
  }

  async insertReply(r: Omit<Reply, 'id'>) {
    const { rows } = await this.pool.query(
      `insert into replies (lead_id, message_id, channel, from_address, subject, body,
                            classification, classification_reason, received_at, handled)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
      [r.lead_id, r.message_id, r.channel, r.from_address, r.subject, r.body,
        r.classification, r.classification_reason, r.received_at, r.handled]);
    return PgStore.reply(rows[0]);
  }

  async listReplies(limit = 200) {
    const { rows } = await this.pool.query(
      'select * from replies order by received_at desc limit $1', [limit]);
    return rows.map(PgStore.reply);
  }

  async setReplyHandled(id: string, handled: boolean) {
    const { rows } = await this.pool.query(
      'update replies set handled = $2 where id = $1 returning *', [id, handled]);
    if (!rows[0]) throw new Error(`reply ${id} not found`);
    return PgStore.reply(rows[0]);
  }

  private static suppression(r: Record<string, unknown>): Suppression {
    return {
      id: String(r.id), value: String(r.value), scope: r.scope as Suppression['scope'],
      reason: r.reason as Suppression['reason'], note: (r.note as string) ?? null,
      created_at: iso(r.created_at),
    };
  }

  async addSuppression(s: Omit<Suppression, 'id' | 'created_at'>) {
    const { rows } = await this.pool.query(
      `insert into suppressions (value, scope, reason, note) values (lower($1),$2,$3,$4)
       on conflict (value, scope) do update set reason = suppressions.reason returning *`,
      [s.value.trim(), s.scope, s.reason, s.note]);
    return PgStore.suppression(rows[0]);
  }

  async listSuppressions() {
    const { rows } = await this.pool.query('select * from suppressions order by created_at desc');
    return rows.map(PgStore.suppression);
  }

  async isSuppressed(address: string) {
    const value = address.trim().toLowerCase();
    const domain = value.includes('@') ? value.split('@')[1] : value;
    const { rows } = await this.pool.query(
      `select * from suppressions
        where (scope = 'address' and value = $1) or (scope = 'domain' and value = $2) limit 1`,
      [value, domain]);
    return rows[0] ? PgStore.suppression(rows[0]) : null;
  }

  private static engine(r: Record<string, unknown>): EngineState {
    return {
      id: 'singleton',
      kill_switch: Boolean(r.kill_switch),
      kill_switch_reason: (r.kill_switch_reason as string) ?? null,
      counter_date: iso(r.counter_date).slice(0, 10),
      sent_today: num(r.sent_today),
      daily_send_cap: num(r.daily_send_cap),
      hourly_send_cap: num(r.hourly_send_cap),
      min_seconds_between_sends: num(r.min_seconds_between_sends),
      quiet_hours_start: num(r.quiet_hours_start),
      quiet_hours_end: num(r.quiet_hours_end),
      last_sent_at: r.last_sent_at ? iso(r.last_sent_at) : null,
      updated_at: iso(r.updated_at),
    };
  }

  async getEngineState() {
    const { rows } = await this.pool.query(
      `insert into engine_state (id) values ('singleton')
       on conflict (id) do update set id = 'singleton' returning *`);
    return PgStore.engine(rows[0]);
  }

  async updateEngineState(patch: Partial<EngineState>) {
    await this.getEngineState();
    const { rows } = await this.pool.query(
      `update engine_state set
         kill_switch               = coalesce($1, kill_switch),
         kill_switch_reason        = $2,
         counter_date              = coalesce($3::date, counter_date),
         sent_today                = coalesce($4, sent_today),
         daily_send_cap            = coalesce($5, daily_send_cap),
         hourly_send_cap           = coalesce($6, hourly_send_cap),
         min_seconds_between_sends = coalesce($7, min_seconds_between_sends),
         quiet_hours_start         = coalesce($8, quiet_hours_start),
         quiet_hours_end           = coalesce($9, quiet_hours_end),
         last_sent_at              = coalesce($10, last_sent_at),
         updated_at                = now()
       where id = 'singleton' returning *`,
      [patch.kill_switch ?? null, patch.kill_switch_reason ?? null, patch.counter_date ?? null,
        patch.sent_today ?? null, patch.daily_send_cap ?? null, patch.hourly_send_cap ?? null,
        patch.min_seconds_between_sends ?? null, patch.quiet_hours_start ?? null,
        patch.quiet_hours_end ?? null, patch.last_sent_at ?? null]);
    return PgStore.engine(rows[0]);
  }

  private static client(r: Record<string, unknown>): Client {
    return {
      id: String(r.id), lead_id: (r.lead_id as string) ?? null, name: String(r.name),
      country: (r.country as string) ?? null,
      build_fee_eur: r.build_fee_eur === null ? null : num(r.build_fee_eur),
      monthly_fee_eur: r.monthly_fee_eur === null ? null : num(r.monthly_fee_eur),
      stripe_customer_id: (r.stripe_customer_id as string) ?? null,
      created_at: iso(r.created_at),
    };
  }

  async insertClient(c: Omit<Client, 'id' | 'created_at'>) {
    const { rows } = await this.pool.query(
      `insert into clients (lead_id, name, country, build_fee_eur, monthly_fee_eur, stripe_customer_id)
       values ($1,$2,$3,$4,$5,$6) returning *`,
      [c.lead_id, c.name, c.country, c.build_fee_eur, c.monthly_fee_eur, c.stripe_customer_id]);
    return PgStore.client(rows[0]);
  }

  async listClients() {
    const { rows } = await this.pool.query('select * from clients order by created_at desc');
    return rows.map(PgStore.client);
  }

  async getClient(id: string) {
    const { rows } = await this.pool.query('select * from clients where id = $1', [id]);
    return rows[0] ? PgStore.client(rows[0]) : null;
  }

  private static agent(r: Record<string, unknown>): Agent {
    return {
      id: String(r.id), client_id: String(r.client_id), name: String(r.name),
      template_key: String(r.template_key), status: r.status as Agent['status'],
      blueprint: r.blueprint as Agent['blueprint'], created_at: iso(r.created_at),
    };
  }

  async insertAgent(a: Omit<Agent, 'id' | 'created_at'>) {
    const { rows } = await this.pool.query(
      `insert into agents (client_id, name, template_key, status, blueprint)
       values ($1,$2,$3,$4,$5::jsonb) returning *`,
      [a.client_id, a.name, a.template_key, a.status, JSON.stringify(a.blueprint)]);
    const agent = PgStore.agent(rows[0]);
    // Mirror credential references (names only, never values) for checklist queries.
    for (const c of a.blueprint.credentials) {
      await this.pool.query(
        `insert into agent_credentials (agent_id, provider, env_var, scope, required, status, docs_url)
         values ($1,$2,$3,$4,$5,$6,$7) on conflict (agent_id, env_var) do nothing`,
        [agent.id, c.provider, c.env_var, c.scope, c.required, c.status, c.docs_url]);
    }
    return agent;
  }

  async getAgent(id: string) {
    const { rows } = await this.pool.query('select * from agents where id = $1', [id]);
    return rows[0] ? PgStore.agent(rows[0]) : null;
  }

  async listAgents(clientId?: string) {
    const { rows } = await this.pool.query(
      'select * from agents where ($1::uuid is null or client_id = $1) order by created_at desc',
      [clientId ?? null]);
    return rows.map(PgStore.agent);
  }

  async updateAgent(id: string, patch: Partial<Pick<Agent, 'status' | 'blueprint' | 'name'>>) {
    const { rows } = await this.pool.query(
      `update agents set
         status    = coalesce($2, status),
         name      = coalesce($3, name),
         blueprint = coalesce($4::jsonb, blueprint)
       where id = $1 returning *`,
      [id, patch.status ?? null, patch.name ?? null, patch.blueprint ? JSON.stringify(patch.blueprint) : null]);
    if (!rows[0]) throw new Error(`agent ${id} not found`);
    return PgStore.agent(rows[0]);
  }

  private static execution(r: Record<string, unknown>): Execution {
    return {
      id: String(r.id), agent_id: String(r.agent_id), status: r.status as Execution['status'],
      outcome: r.outcome as Execution['outcome'], minutes_saved: num(r.minutes_saved),
      revenue_influenced_eur: num(r.revenue_influenced_eur),
      error: (r.error as string) ?? null, started_at: iso(r.started_at),
    };
  }

  async insertExecution(e: Omit<Execution, 'id'>) {
    const { rows } = await this.pool.query(
      `insert into executions (agent_id, status, outcome, minutes_saved, revenue_influenced_eur, error, started_at)
       values ($1,$2,$3::jsonb,$4,$5,$6,$7) returning *`,
      [e.agent_id, e.status, JSON.stringify(e.outcome), e.minutes_saved,
        e.revenue_influenced_eur, e.error, e.started_at]);
    return PgStore.execution(rows[0]);
  }

  async listExecutions(agentId: string, limit = 100) {
    const { rows } = await this.pool.query(
      'select * from executions where agent_id = $1 order by started_at desc limit $2', [agentId, limit]);
    return rows.map(PgStore.execution);
  }

  async listExecutionsForClient(clientId: string) {
    const { rows } = await this.pool.query(
      `select e.* from executions e join agents a on a.id = e.agent_id where a.client_id = $1`, [clientId]);
    return rows.map(PgStore.execution);
  }

  /* --- accounts and usage --------------------------------------------- */

  private static account(r: Record<string, unknown>): Account {
    return {
      id: String(r.id), name: String(r.name), email: String(r.email),
      plan: r.plan as Account['plan'],
      subscription_state: r.subscription_state as Account['subscription_state'],
      stripe_customer_id: (r.stripe_customer_id as string) ?? null,
      stripe_subscription_id: (r.stripe_subscription_id as string) ?? null,
      current_period_end: r.current_period_end ? iso(r.current_period_end) : null,
      created_at: iso(r.created_at),
    };
  }

  async listAccounts(): Promise<Account[]> {
    const { rows } = await this.pool.query('select * from accounts order by created_at');
    return rows.map(PgStore.account);
  }

  async getAccount(id: string): Promise<Account | null> {
    const { rows } = await this.pool.query('select * from accounts where id = $1', [id]);
    return rows[0] ? PgStore.account(rows[0]) : null;
  }

  async findAccountByEmail(email: string): Promise<Account | null> {
    const { rows } = await this.pool.query('select * from accounts where lower(email) = lower($1)', [email.trim()]);
    return rows[0] ? PgStore.account(rows[0]) : null;
  }

  async findAccountByStripeCustomer(customerId: string): Promise<Account | null> {
    const { rows } = await this.pool.query('select * from accounts where stripe_customer_id = $1', [customerId]);
    return rows[0] ? PgStore.account(rows[0]) : null;
  }

  async insertAccount(a: Omit<Account, 'id' | 'created_at'>): Promise<Account> {
    const { rows } = await this.pool.query(
      `insert into accounts (name, email, plan, subscription_state, stripe_customer_id,
                             stripe_subscription_id, current_period_end)
       values ($1,$2,$3,$4,$5,$6,$7) returning *`,
      [a.name, a.email, a.plan, a.subscription_state, a.stripe_customer_id,
        a.stripe_subscription_id, a.current_period_end]);
    return PgStore.account(rows[0]);
  }

  async updateAccount(id: string, patch: Partial<Omit<Account, 'id' | 'created_at'>>): Promise<Account> {
    const keys = Object.keys(patch);
    if (keys.length === 0) {
      const current = await this.getAccount(id);
      if (!current) throw new Error(`no account ${id}`);
      return current;
    }
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const { rows } = await this.pool.query(
      `update accounts set ${sets} where id = $1 returning *`,
      [id, ...keys.map((k) => (patch as Record<string, unknown>)[k])]);
    if (!rows[0]) throw new Error(`no account ${id}`);
    return PgStore.account(rows[0]);
  }

  async getUsage(accountId: string, period: string): Promise<Usage> {
    const { rows } = await this.pool.query(
      'select * from usage where account_id = $1 and period = $2', [accountId, period]);
    if (!rows[0]) {
      return { account_id: accountId, period, audits: 0, leads_discovered: 0, messages_sent: 0, updated_at: nowIso() };
    }
    const r = rows[0];
    return {
      account_id: String(r.account_id), period: String(r.period),
      audits: num(r.audits), leads_discovered: num(r.leads_discovered),
      messages_sent: num(r.messages_sent), updated_at: iso(r.updated_at),
    };
  }

  async addUsage(
    accountId: string,
    period: string,
    delta: Partial<Pick<Usage, 'audits' | 'leads_discovered' | 'messages_sent'>>,
  ): Promise<Usage> {
    // Upsert so two concurrent runs cannot both insert the period row.
    await this.pool.query(
      `insert into usage (account_id, period, audits, leads_discovered, messages_sent)
       values ($1,$2,$3,$4,$5)
       on conflict (account_id, period) do update set
         audits = usage.audits + excluded.audits,
         leads_discovered = usage.leads_discovered + excluded.leads_discovered,
         messages_sent = usage.messages_sent + excluded.messages_sent,
         updated_at = now()`,
      [accountId, period, delta.audits ?? 0, delta.leads_discovered ?? 0, delta.messages_sent ?? 0]);
    return this.getUsage(accountId, period);
  }
}
