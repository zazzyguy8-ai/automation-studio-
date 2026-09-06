import type { AuditResult, Demo, Lead, Snapshot } from '@/lib/types';

export interface AuditInput {
  lead: Lead;
  snapshot: Snapshot;
}

export interface CopyInput {
  lead: Lead;
  audit: AuditResult;
  demo: Demo;
  channel: 'email' | 'linkedin' | 'instagram';
  step: number;
  sender: { name: string; company: string; calendar_url: string };
}

export interface CopyOutput {
  subject: string | null;
  body: string;
  /** Verbatim audit facts this message leans on. Empty => approval blocked. */
  grounding: string[];
}

export interface ReasoningProvider {
  readonly name: string;
  analyzeBusiness(input: AuditInput): Promise<AuditResult>;
  writeOutreach(input: CopyInput): Promise<CopyOutput>;
  writeDemoScript(input: { lead: Lead; audit: AuditResult }): Promise<{
    headline: string;
    before: string[];
    after: string[];
    scenes: Array<{ t: string; on_screen: string; narration: string }>;
  }>;
}
