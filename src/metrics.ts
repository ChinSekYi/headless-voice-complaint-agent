import { promises as fs } from "fs";
import path from "path";

/**
 * Voice AI Performance Metrics
 * Tracks:
 * 1. % of conversations that reach valid outcome
 * 2. End-to-end latency (speech → text → LLM → response → voice)
 * 3. Number of utterances per task (turns before resolution)
 */

export interface MetricRecord {
  sessionId: string;
  timestamp: string;
  // Outcome tracking
  isComplete: boolean;
  hadValidOutcome: boolean;
  complaintType?: string | undefined;
  
  // Latency tracking (in ms) - all optional numbers
  totalLatencyMs: number;
  sttLatencyMs?: number | undefined;
  llmLatencyMs?: number | undefined;
  ttsLatencyMs?: number | undefined;
  
  // Conversation turns
  totalUtterances: number;
  userUtterances: number;
  botUtterances: number;
  
  // Additional context
  missingFieldsAtEnd: number;
  questionsAsked: number;
  description?: string | undefined;
}

const METRICS_FILE = path.join(process.cwd(), "data", "metrics.ndjson");

export async function initMetrics(): Promise<void> {
  try {
    const dataDir = path.join(process.cwd(), "data");
    await fs.mkdir(dataDir, { recursive: true });
    try {
      await fs.access(METRICS_FILE);
    } catch {
      await fs.writeFile(METRICS_FILE, "");
    }
  } catch (error) {
    console.warn("Metrics init failed:", error);
  }
}

export async function recordMetric(metric: MetricRecord): Promise<void> {
  try {
    const line = JSON.stringify(metric) + "\n";
    await fs.appendFile(METRICS_FILE, line, { encoding: "utf8" });
    console.log(`[metrics] Recorded: session=${metric.sessionId} outcome=${metric.hadValidOutcome} latency=${metric.totalLatencyMs}ms utterances=${metric.totalUtterances}`);
  } catch (error) {
    console.warn("[metrics] Failed to record metric:", error);
  }
}

export async function getMetricsSnapshot(): Promise<{
  totalConversations: number;
  validOutcomeRate: number;
  avgLatencyMs: number;
  avgUtterancesPerTask: number;
  completionRate: number;
}> {
  try {
    const content = await fs.readFile(METRICS_FILE, "utf-8");
    const lines = content.trim().split("\n").filter((l) => l);
    
    if (lines.length === 0) {
      return {
        totalConversations: 0,
        validOutcomeRate: 0,
        avgLatencyMs: 0,
        avgUtterancesPerTask: 0,
        completionRate: 0,
      };
    }
    
    const records: MetricRecord[] = lines.map((line) => JSON.parse(line));
    
    const validOutcomes = records.filter((r) => r.hadValidOutcome).length;
    const completedConversations = records.filter((r) => r.isComplete).length;
    const totalLatency = records.reduce((sum, r) => sum + r.totalLatencyMs, 0);
    const totalUtterances = records.reduce((sum, r) => sum + r.totalUtterances, 0);
    
    return {
      totalConversations: records.length,
      validOutcomeRate: records.length > 0 ? (validOutcomes / records.length) * 100 : 0,
      avgLatencyMs: records.length > 0 ? totalLatency / records.length : 0,
      avgUtterancesPerTask: records.length > 0 ? totalUtterances / records.length : 0,
      completionRate: records.length > 0 ? (completedConversations / records.length) * 100 : 0,
    };
  } catch (error) {
    console.warn("[metrics] Failed to read metrics:", error);
    return {
      totalConversations: 0,
      validOutcomeRate: 0,
      avgLatencyMs: 0,
      avgUtterancesPerTask: 0,
      completionRate: 0,
    };
  }
}

/**
 * Calculate latency breakdown from timestamps
 */
export function calculateLatencies(
  totalMs: number,
  sttMs?: number,
  ttsMs?: number,
  llmMs?: number
): { totalMs: number; sttMs?: number; llmMs?: number; ttsMs?: number; otherMs: number } {
  const accounted = (sttMs ?? 0) + (ttsMs ?? 0) + (llmMs ?? 0);
  const otherMs = Math.max(0, totalMs - accounted);
  
  return {
    totalMs,
    ...(sttMs !== undefined && { sttMs }),
    ...(llmMs !== undefined && { llmMs }),
    ...(ttsMs !== undefined && { ttsMs }),
    otherMs,
  };
}

/**
 * Determine if conversation had a valid outcome
 */
export function hasValidOutcome(
  isComplete: boolean,
  missingFields: number,
  userProvidedInfo: boolean
): boolean {
  // Valid if:
  // 1. Explicitly complete, OR
  // 2. User provided substantive info + we collected most fields
  return isComplete || (userProvidedInfo && missingFields <= 2);
}
