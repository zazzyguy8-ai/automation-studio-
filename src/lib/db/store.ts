import type {
  Agent, Audit, Client, Demo, Execution, Lead, LeadStage, OutreachMessage, Snapshot,
} from '@/lib/types';

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

  insertOutreach(m: Omit<OutreachMessage, 'id'>): Promise<OutreachMessage>;
  listOutreach(leadId: string): Promise<OutreachMessage[]>;
  setOutreachStatus(id: string, status: OutreachMessage['status']): Promise<OutreachMessage>;

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
}

export function newId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
