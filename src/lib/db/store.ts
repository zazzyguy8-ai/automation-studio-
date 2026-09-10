import type {
  Account, Agent, Audit, Campaign, Client, Demo, EngineState, Execution, Lead, LeadStage,
  OutreachMessage, Reply, Snapshot, Suppression, Usage,
} from '@/lib/types';

/** Engine-only fields default when a caller does not set them, so the older
 *  call sites (pipeline, tests) stay unchanged. */
export type NewOutreachMessage =
  Omit<OutreachMessage, 'id' | 'campaign_id' | 'thread_id' | 'scheduled_at' | 'sent_to' | 'stop_reason'>
  & Partial<Pick<OutreachMessage, 'campaign_id' | 'thread_id' | 'scheduled_at' | 'sent_to' | 'stop_reason'>>;

export interface LeadFilter {
  q?: string;
  stage?: LeadStage;
  industry?: string;
  country?: string;
}

/** The whole persistence surface. Two drivers implement it: Postgres
 *  (Supabase in production) and a file-backed store for local work. */
export interface Store {
  init(): Promise<void>;

  upsertLead(lead: Omit<Lead, 'id' | 'created_at' | 'updated_at'> & { id?: string }): Promise<Lead>;
  getLead(id: string): Promise<Lead | null>;
  findLeadByWebsite(website: string): Promise<Lead | null>;
  listLeads(filter?: LeadFilter): Promise<Lead[]>;
  setLeadStage(id: string, stage: LeadStage): Promise<Lead>;

  insertSnapshot(s: Omit<Snapshot, 'id'>): Promise<Snapshot>;
  latestSnapshot(leadId: string): Promise<Snapshot | null>;

  insertAudit(a: Omit<Audit, 'id'>): Promise<Audit>;
  getAudit(id: string): Promise<Audit | null>;
  latestAudit(leadId: string): Promise<Audit | null>;

  insertDemo(d: Omit<Demo, 'id'>): Promise<Demo>;
  latestDemo(leadId: string): Promise<Demo | null>;

  insertOutreach(m: NewOutreachMessage): Promise<OutreachMessage>;
  listOutreach(leadId: string): Promise<OutreachMessage[]>;
  setOutreachStatus(
    id: string, status: OutreachMessage['status'], patch?: Partial<OutreachMessage>,
  ): Promise<OutreachMessage>;
  getOutreach(id: string): Promise<OutreachMessage | null>;
  /** Messages whose scheduled time has arrived and that are ready to send. */
  listSendable(now: string, limit: number): Promise<OutreachMessage[]>;
  listOutreachByThread(threadId: string): Promise<OutreachMessage[]>;
  listOutreachByStatus(status: OutreachMessage['status'], limit?: number): Promise<OutreachMessage[]>;
  countOutreach(): Promise<Record<OutreachMessage['status'], number>>;

  insertCampaign(c: Omit<Campaign, 'id' | 'created_at'>): Promise<Campaign>;
  listCampaigns(): Promise<Campaign[]>;
  getCampaign(id: string): Promise<Campaign | null>;
  setCampaignStatus(id: string, status: Campaign['status']): Promise<Campaign>;

  insertReply(r: Omit<Reply, 'id'>): Promise<Reply>;
  listReplies(limit?: number): Promise<Reply[]>;
  setReplyHandled(id: string, handled: boolean): Promise<Reply>;

  addSuppression(s: Omit<Suppression, 'id' | 'created_at'>): Promise<Suppression>;
  listSuppressions(): Promise<Suppression[]>;
  isSuppressed(address: string): Promise<Suppression | null>;

  getEngineState(): Promise<EngineState>;
  updateEngineState(patch: Partial<EngineState>): Promise<EngineState>;

  insertClient(c: Omit<Client, 'id' | 'created_at'>): Promise<Client>;
  listClients(): Promise<Client[]>;
  getClient(id: string): Promise<Client | null>;

  insertAgent(a: Omit<Agent, 'id' | 'created_at'>): Promise<Agent>;
  getAgent(id: string): Promise<Agent | null>;
  listAgents(clientId?: string): Promise<Agent[]>;
  updateAgent(id: string, patch: Partial<Pick<Agent, 'status' | 'blueprint' | 'name'>>): Promise<Agent>;

  insertExecution(e: Omit<Execution, 'id'>): Promise<Execution>;
  listExecutions(agentId: string, limit?: number): Promise<Execution[]>;
  listExecutionsForClient(clientId: string): Promise<Execution[]>;

  /* --- accounts and usage ---------------------------------------------
   * These sit ABOVE the account boundary: they are the registry the boundary
   * is drawn from, so they take an explicit account id where the scoped
   * methods take none.
   */
  listAccounts(): Promise<Account[]>;
  getAccount(id: string): Promise<Account | null>;
  findAccountByEmail(email: string): Promise<Account | null>;
  findAccountByStripeCustomer(customerId: string): Promise<Account | null>;
  insertAccount(a: Omit<Account, 'id' | 'created_at'>): Promise<Account>;
  updateAccount(id: string, patch: Partial<Omit<Account, 'id' | 'created_at'>>): Promise<Account>;
  getUsage(accountId: string, period: string): Promise<Usage>;
  addUsage(
    accountId: string,
    period: string,
    delta: Partial<Pick<Usage, 'audits' | 'leads_discovered' | 'messages_sent'>>,
  ): Promise<Usage>;

}

export function newId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
