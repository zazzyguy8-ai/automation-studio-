import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type {
  Agent, Audit, Campaign, Client, Demo, EngineState, Execution, Lead, LeadStage,
  OutreachMessage, Reply, Snapshot, Suppression,
} from '@/lib/types';
import { type LeadFilter, type NewOutreachMessage, type Store, newId, nowIso } from './store';

/** Conservative defaults: a new install sends slowly until you widen it. */
const DEFAULT_ENGINE_STATE: EngineState = {
  id: 'singleton',
  kill_switch: false,
  kill_switch_reason: null,
  counter_date: new Date().toISOString().slice(0, 10),
  sent_today: 0,
  daily_send_cap: 30,
  hourly_send_cap: 8,
  min_seconds_between_sends: 90,
  quiet_hours_start: 20,
  quiet_hours_end: 8,
  last_sent_at: null,
  updated_at: nowIso(),
};

interface Db {
  leads: Lead[];
  snapshots: Snapshot[];
  audits: Audit[];
  demos: Demo[];
  outreach: OutreachMessage[];
  clients: Client[];
  agents: Agent[];
  executions: Execution[];
  campaigns: Campaign[];
  replies: Reply[];
  suppressions: Suppression[];
  engine: EngineState | null;
}

const EMPTY: Db = {
  leads: [], snapshots: [], audits: [], demos: [],
  outreach: [], clients: [], agents: [], executions: [],
  campaigns: [], replies: [], suppressions: [], engine: null,
};

/** Zero-dependency store so the whole pipeline runs before any Postgres exists.
 *  Same interface as the Postgres driver, so switching is a one-line env change. */
export class FileStore implements Store {
  private path: string;
  private db: Db = structuredClone(EMPTY);
  private loaded = false;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(path = process.env.DATA_FILE ?? join(process.cwd(), '.data', 'studio.json')) {
    this.path = path;
  }

  async init(): Promise<void> {
    if (this.loaded) return;
    try {
      this.db = { ...structuredClone(EMPTY), ...JSON.parse(await readFile(this.path, 'utf8')) };
    } catch {
      this.db = structuredClone(EMPTY);
    }
    this.loaded = true;
  }

  private async flush(): Promise<void> {
    const snapshot = JSON.stringify(this.db, null, 2);
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      await writeFile(this.path, snapshot);
    });
    return this.writeQueue;
  }

  async upsertLead(input: Omit<Lead, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<Lead> {
    await this.init();
    const existing =
      (input.id && this.db.leads.find((l) => l.id === input.id)) ||
      this.db.leads.find((l) => l.website.toLowerCase() === input.website.toLowerCase());
    if (existing) {
      Object.assign(existing, input, { id: existing.id, created_at: existing.created_at, updated_at: nowIso() });
      await this.flush();
      return existing;
    }
    const lead: Lead = { ...input, id: input.id ?? newId(), created_at: nowIso(), updated_at: nowIso() };
    this.db.leads.push(lead);
    await this.flush();
    return lead;
  }

  async getLead(id: string) {
    await this.init();
    return this.db.leads.find((l) => l.id === id) ?? null;
  }

  async findLeadByWebsite(website: string) {
    await this.init();
    return this.db.leads.find((l) => l.website.toLowerCase() === website.toLowerCase()) ?? null;
  }

  async listLeads(filter: LeadFilter = {}) {
    await this.init();
    const q = filter.q?.toLowerCase();
    return this.db.leads
      .filter((l) => (!q || `${l.company_name} ${l.website} ${l.industry ?? ''}`.toLowerCase().includes(q)))
      .filter((l) => (!filter.stage || l.stage === filter.stage))
      .filter((l) => (!filter.industry || l.industry === filter.industry))
      .filter((l) => (!filter.country || l.country === filter.country))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async setLeadStage(id: string, stage: LeadStage) {
    await this.init();
    const lead = this.db.leads.find((l) => l.id === id);
    if (!lead) throw new Error(`lead ${id} not found`);
    lead.stage = stage;
    lead.updated_at = nowIso();
    await this.flush();
    return lead;
  }

  async insertSnapshot(s: Omit<Snapshot, 'id'>) {
    await this.init();
    const row: Snapshot = { ...s, id: newId() };
    this.db.snapshots.push(row);
    await this.flush();
    return row;
  }

  async latestSnapshot(leadId: string) {
    await this.init();
    return [...this.db.snapshots].filter((s) => s.lead_id === leadId)
      .sort((a, b) => b.fetched_at.localeCompare(a.fetched_at))[0] ?? null;
  }

  async insertAudit(a: Omit<Audit, 'id'>) {
    await this.init();
    const row: Audit = { ...a, id: newId() };
    this.db.audits.push(row);
    await this.flush();
    return row;
  }

  async getAudit(id: string) {
    await this.init();
    return this.db.audits.find((a) => a.id === id) ?? null;
  }

  async latestAudit(leadId: string) {
    await this.init();
    return [...this.db.audits].filter((a) => a.lead_id === leadId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
  }

  async insertDemo(d: Omit<Demo, 'id'>) {
    await this.init();
    const row: Demo = { ...d, id: newId() };
    this.db.demos.push(row);
    await this.flush();
    return row;
  }

  async latestDemo(leadId: string) {
    await this.init();
    return [...this.db.demos].filter((d) => d.lead_id === leadId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
  }

  async insertOutreach(m: NewOutreachMessage) {
    await this.init();
    const row: OutreachMessage = {
      campaign_id: null, thread_id: null, scheduled_at: null, sent_to: null, stop_reason: null,
      ...m,
      id: newId(),
    };
    this.db.outreach.push(row);
    await this.flush();
    return row;
  }

  async listOutreach(leadId: string) {
    await this.init();
    return this.db.outreach.filter((m) => m.lead_id === leadId).sort((a, b) => a.step - b.step);
  }

  async setOutreachStatus(id: string, status: OutreachMessage['status'], patch: Partial<OutreachMessage> = {}) {
    await this.init();
    const row = this.db.outreach.find((m) => m.id === id);
    if (!row) throw new Error(`outreach ${id} not found`);
    Object.assign(row, patch);
    row.status = status;
    if (status === 'approved') row.approved_at = nowIso();
    if (status === 'sent') row.sent_at = row.sent_at ?? nowIso();
    await this.flush();
    return row;
  }

  async getOutreach(id: string) {
    await this.init();
    return this.db.outreach.find((m) => m.id === id) ?? null;
  }

  async listSendable(now: string, limit: number) {
    await this.init();
    return this.db.outreach
      .filter((m) => (m.status === 'approved' || m.status === 'queued'))
      .filter((m) => !m.scheduled_at || m.scheduled_at <= now)
      .sort((a, b) => (a.scheduled_at ?? a.created_at).localeCompare(b.scheduled_at ?? b.created_at))
      .slice(0, limit);
  }

  async listOutreachByThread(threadId: string) {
    await this.init();
    return this.db.outreach.filter((m) => m.thread_id === threadId).sort((a, b) => a.step - b.step);
  }

  async listOutreachByStatus(status: OutreachMessage['status'], limit = 200) {
    await this.init();
    return this.db.outreach
      .filter((m) => m.status === status)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  }

  async countOutreach() {
    await this.init();
    const counts = {} as Record<OutreachMessage['status'], number>;
    for (const m of this.db.outreach) counts[m.status] = (counts[m.status] ?? 0) + 1;
    return counts;
  }

  async insertCampaign(c: Omit<Campaign, 'id' | 'created_at'>) {
    await this.init();
    const row: Campaign = { ...c, id: newId(), created_at: nowIso() };
    this.db.campaigns.push(row);
    await this.flush();
    return row;
  }

  async listCampaigns() {
    await this.init();
    return [...this.db.campaigns].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async getCampaign(id: string) {
    await this.init();
    return this.db.campaigns.find((c) => c.id === id) ?? null;
  }

  async setCampaignStatus(id: string, status: Campaign['status']) {
    await this.init();
    const row = this.db.campaigns.find((c) => c.id === id);
    if (!row) throw new Error(`campaign ${id} not found`);
    row.status = status;
    await this.flush();
    return row;
  }

  async insertReply(r: Omit<Reply, 'id'>) {
    await this.init();
    const row: Reply = { ...r, id: newId() };
    this.db.replies.push(row);
    await this.flush();
    return row;
  }

  async listReplies(limit = 200) {
    await this.init();
    return [...this.db.replies]
      .sort((a, b) => b.received_at.localeCompare(a.received_at))
      .slice(0, limit);
  }

  async setReplyHandled(id: string, handled: boolean) {
    await this.init();
    const row = this.db.replies.find((r) => r.id === id);
    if (!row) throw new Error(`reply ${id} not found`);
    row.handled = handled;
    await this.flush();
    return row;
  }

  async addSuppression(s: Omit<Suppression, 'id' | 'created_at'>) {
    await this.init();
    const value = s.value.trim().toLowerCase();
    const existing = this.db.suppressions.find((x) => x.value === value && x.scope === s.scope);
    if (existing) return existing;
    const row: Suppression = { ...s, value, id: newId(), created_at: nowIso() };
    this.db.suppressions.push(row);
    await this.flush();
    return row;
  }

  async listSuppressions() {
    await this.init();
    return [...this.db.suppressions].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async isSuppressed(address: string) {
    await this.init();
    const value = address.trim().toLowerCase();
    const domain = value.includes('@') ? value.split('@')[1] : value;
    return this.db.suppressions.find(
      (s) => (s.scope === 'address' && s.value === value) || (s.scope === 'domain' && s.value === domain),
    ) ?? null;
  }

  async getEngineState() {
    await this.init();
    if (!this.db.engine) {
      this.db.engine = { ...DEFAULT_ENGINE_STATE };
      await this.flush();
    }
    return this.db.engine;
  }

  async updateEngineState(patch: Partial<EngineState>) {
    await this.init();
    const current = await this.getEngineState();
    this.db.engine = { ...current, ...patch, id: 'singleton', updated_at: nowIso() };
    await this.flush();
    return this.db.engine;
  }

  async insertClient(c: Omit<Client, 'id' | 'created_at'>) {
    await this.init();
    const row: Client = { ...c, id: newId(), created_at: nowIso() };
    this.db.clients.push(row);
    await this.flush();
    return row;
  }

  async listClients() {
    await this.init();
    return [...this.db.clients].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async getClient(id: string) {
    await this.init();
    return this.db.clients.find((c) => c.id === id) ?? null;
  }

  async insertAgent(a: Omit<Agent, 'id' | 'created_at'>) {
    await this.init();
    const row: Agent = { ...a, id: newId(), created_at: nowIso() };
    this.db.agents.push(row);
    await this.flush();
    return row;
  }

  async getAgent(id: string) {
    await this.init();
    return this.db.agents.find((a) => a.id === id) ?? null;
  }

  async listAgents(clientId?: string) {
    await this.init();
    return this.db.agents.filter((a) => !clientId || a.client_id === clientId);
  }

  async updateAgent(id: string, patch: Partial<Pick<Agent, 'status' | 'blueprint' | 'name'>>) {
    await this.init();
    const row = this.db.agents.find((a) => a.id === id);
    if (!row) throw new Error(`agent ${id} not found`);
    Object.assign(row, patch);
    await this.flush();
    return row;
  }

  async insertExecution(e: Omit<Execution, 'id'>) {
    await this.init();
    const row: Execution = { ...e, id: newId() };
    this.db.executions.push(row);
    await this.flush();
    return row;
  }

  async listExecutions(agentId: string, limit = 100) {
    await this.init();
    return this.db.executions.filter((e) => e.agent_id === agentId)
      .sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(0, limit);
  }

  async listExecutionsForClient(clientId: string) {
    await this.init();
    const ids = new Set(this.db.agents.filter((a) => a.client_id === clientId).map((a) => a.id));
    return this.db.executions.filter((e) => ids.has(e.agent_id));
  }
}
