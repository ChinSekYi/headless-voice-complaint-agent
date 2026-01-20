import { AzureOpenAI } from "openai";
import { AgentResult, ComplaintType, AgentState } from "./states.js";

const CLASSIFY_PROMPT = `You are a hospital complaint classifier. Classify the complaint into ONE of these types:
- APPOINTMENT (reschedule, cancel, doctor availability, wait time for appointment)
- BILLING (charges, invoices, insurance, payment issues)
- OTHER (facilities, staff conduct, general feedback)

Return ONLY the type name. Nothing else.`;

const RESPONSE_TEMPLATES: Record<ComplaintType, string> = {
  APPOINTMENT:
    "Thank you for bringing this to our attention. We understand appointment scheduling can be frustrating. Our team will contact you within 24 hours to help reschedule or resolve this issue.",
  BILLING:
    "We appreciate you reporting this billing concern. Our finance team will review your account and reach out within 48 hours with a resolution.",
  OTHER:
    "Thank you for your feedback. We take all concerns seriously and will route this to the appropriate department for review."
};

async function classifyWithLLM(text: string): Promise<{ type: ComplaintType; llmMs: number; usedLLM: boolean }> {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;

  if (!endpoint || !apiKey || !deployment) {
    console.warn("Azure OpenAI not configured, falling back to keyword classifier");
    return { type: keywordClassify(text), llmMs: 0, usedLLM: false };
  }

  const client = new AzureOpenAI({
    apiKey,
    apiVersion: "2024-02-15-preview",
    baseURL: `${endpoint}/openai/deployments/${deployment}`
  });
  const t0 = Date.now();

  try {
    const response = await client.chat.completions.create({
      model: deployment,
      messages: [
        { role: "system", content: CLASSIFY_PROMPT },
        { role: "user", content: text }
      ],
      temperature: 0,
      max_tokens: 10
    });

    const llmMs = Date.now() - t0;
    const raw = response.choices?.[0]?.message?.content?.trim() ?? "";

    if (raw.includes("APPOINTMENT")) return { type: "APPOINTMENT", llmMs, usedLLM: true };
    if (raw.includes("BILLING")) return { type: "BILLING", llmMs, usedLLM: true };
    return { type: "OTHER", llmMs, usedLLM: true };
  } catch (error) {
    console.error("LLM classification error:", error);
    return { type: keywordClassify(text), llmMs: Date.now() - t0, usedLLM: false };
  }
}

function keywordClassify(text: string): ComplaintType {
  const t = text.toLowerCase();
  if (/\bappointment|schedule|reschedule|cancel|doctor|wait\b/.test(t)) return "APPOINTMENT";
  if (/\bbill|billing|charge|payment|invoice|insurance\b/.test(t)) return "BILLING";
  return "OTHER";
}

export async function handleComplaint(text: string): Promise<AgentResult> {
  const decisionPath: AgentState[] = ["CLASSIFY_COMPLAINT"];

  // Classify
  const { type, llmMs, usedLLM } = await classifyWithLLM(text);

  // Respond
  decisionPath.push("RESPOND");
  const responseText = `Thank you for your feedback: "${text}". ${RESPONSE_TEMPLATES[type]}`;

  return {
    complaintType: type,
    responseText,
    decisionPath,
    llmMs,
    usedLLM
  };
}