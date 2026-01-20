export type AgentState = 'CLASSIFY_COMPLAINT' | 'RESPOND';
export type ComplaintType = 'APPOINTMENT' | 'BILLING' | 'OTHER';

export interface AgentResult {
  complaintType: ComplaintType;
  responseText: string;
  decisionPath: AgentState[];
  llmMs: number;
  usedLLM: boolean;
}