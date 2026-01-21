import { AzureChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { GraphState } from "./graphState.js";
import { ComplaintDomain, ComplaintSubcategory } from "../config/complaintSchema.js";
import { RequiredFieldsBySubcategory } from "../config/requiredFields.js";

/**
 * LangGraph nodes for conversational complaint handling
 * Based on docs/conversational_agent_instructions.md and docs/diagrams/Flowchart.jpg
 */

/**
 * Rule-Based Validation Helpers (Fast, No LLM Cost)
 * Strategy: Try rule-based first (cheap), fall back to LLM if needed (flexible)
 */
interface ValidationResult {
  isValid: boolean;
  errorMessage?: string;
}

/**
 * Helper to get recent messages only (optimization to reduce LLM context size)
 * Only sends last 6 messages (3 exchanges) to LLM instead of entire history
 */
function getRecentMessages(messages: any[], count: number = 6): any[] {
  return messages.slice(-count);
}

function validateDate(dateString: string): ValidationResult {
  // Check for obviously invalid dates
  const datePatterns = [
    /(\d{1,2})[\/\-\s](jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[\/\-\s]?(\d{2,4})/i,
    /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/,
    /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[\/\-\s](\d{1,2})[\/\-\s]?(\d{2,4})/i,
  ];
  
  // Extract day number if present
  const dayMatch = dateString.match(/\b(\d{1,3})\b/);
  if (dayMatch && dayMatch[1]) {
    const day = parseInt(dayMatch[1]);
    // Days must be between 1 and 31
    if (day > 31 || day < 1) {
      return {
        isValid: false,
        errorMessage: `I'm sorry, "${day}" doesn't look like a valid day - days go from 1 to 31. Could you try again with the correct date? (For example: "June 24" or "24 Jun 2025")`,
      };
    }
  }
  
  // Check for month names with impossible days
  const monthDays: { [key: string]: number } = {
    jan: 31, january: 31,
    feb: 29, february: 29, // allowing leap year
    mar: 31, march: 31,
    apr: 30, april: 30,
    may: 31,
    jun: 30, june: 30,
    jul: 31, july: 31,
    aug: 31, august: 31,
    sep: 30, september: 30,
    oct: 31, october: 31,
    nov: 30, november: 30,
    dec: 31, december: 31,
  };
  
  for (const [month, maxDay] of Object.entries(monthDays)) {
    if (dateString.toLowerCase().includes(month)) {
      const dayMatch = dateString.match(/\b(\d{1,2})\b/);
      if (dayMatch && dayMatch[1]) {
        const day = parseInt(dayMatch[1]);
        if (day > maxDay) {
          return {
            isValid: false,
            errorMessage: `I'm sorry, ${month.charAt(0).toUpperCase() + month.slice(1)} only has ${maxDay} days. Could you try again with the correct date?`,
          };
        }
      }
    }
  }
  
  // Check for year in far future (> 2050)
  const yearMatch = dateString.match(/\b(20\d{2}|21\d{2}|[3-9]\d{3})\b/);
  if (yearMatch && yearMatch[1]) {
    const year = parseInt(yearMatch[1]);
    if (year > 2050) {
      return {
        isValid: false,
        errorMessage: `I'm sorry, the year ${year} seems incorrect. Could you double-check and provide the date again?`,
      };
    }
  }
  
  return { isValid: true };
}

function validateAmount(amountString: string): ValidationResult {
  const amountMatch = amountString.match(/[-]?\d+/);
  if (amountMatch) {
    const amount = parseInt(amountMatch[0]);
    if (amount < 0) {
      return {
        isValid: false,
        errorMessage: `I'm sorry, the amount can't be negative. Could you provide the billing amount again?`,
      };
    }
  }
  return { isValid: true };
}

// Initialize Azure OpenAI LLM
const llm = new AzureChatOpenAI({
  azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY!,
  azureOpenAIEndpoint: process.env.AZURE_OPENAI_ENDPOINT!,
  azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_DEPLOYMENT!,
  azureOpenAIApiVersion: "2024-02-15-preview",
  temperature: 0.7,
});

/**
 * Node 0: resetState
 * Pure function that resets needsMoreInfo flag for new messages in continuation
 */
export function resetState(state: GraphState): Partial<GraphState> {
  return {
    needsMoreInfo: false,
  };
}

/**
 * Node 1: validateInput
 * LLM node that checks if user input contains an actual complaint
 * Only validates if we haven't classified a complaint yet (first message or new conversation)
 */
export async function validateInput(state: GraphState): Promise<Partial<GraphState>> {
  const lastMessage = state.messages[state.messages.length - 1];
  const userInput = lastMessage?.content?.toString() || "";

  console.log(`[validateInput] Input: "${userInput.substring(0, 30)}...", subcategory: ${state.complaint.subcategory}, currentQuestion: ${state.currentQuestion}`);

  // If we already have a classified complaint, don't validate - just proceed
  if (state.complaint.subcategory) {
    console.log(`[validateInput] Already classified, skipping validation`);
    return { needsMoreInfo: false };
  }

  // If we have a currentQuestion, that means the agent asked a follow-up
  // Don't validate - they're answering the question, not making a new complaint
  if (state.currentQuestion) {
    console.log(`[validateInput] Agent asked a question, skipping validation (awaiting answer)`);
    return { needsMoreInfo: false };
  }

  // Otherwise, validate this message as a potential new complaint

  const validatePrompt = `You are a hospital complaint intake specialist. Determine if this message contains an actual complaint or concern that needs to be addressed.

Examples of VALID complaints (specific issue mentioned):
- "I waited 4 hours for my appointment"
- "The nurse was very rude to me"
- "I was charged incorrectly for my visit"
- "The doctor prescribed the wrong medication"
- "My surgery was delayed without explanation"
- "My appointment is wrong"
- "My billing is wrong"
- "I had a problem with my medication"
- "The staff was unprofessional"

Examples of INVALID (just greetings or no issue mentioned):
- "hi"
- "hello"
- "I need help" (no specific issue)
- "I want to complain" (no specific issue)
- "Can you help me?" (no specific issue)

User Message:
"${userInput}"

IMPORTANT: If they mention ANY specific complaint topic (appointment, billing, medication, staff, wait time, etc.), it's VALID.
Only mark as VAGUE if it's a pure greeting or has NO complaint topic mentioned.

Respond with ONLY ONE WORD:
- "VALID" if the message mentions a complaint topic or issue
- "VAGUE" if it's just a greeting or has no complaint topic`;

  const response = await llm.invoke(validatePrompt);
  const validation = response.content.toString().trim().toUpperCase();

  if (validation.includes("VAGUE")) {
    // Ask user to provide more details in a warm, empathetic way
    const clarifyMessage = `Hello! I'm here to help you with any concerns you have about your experience at Singapore General Hospital (SGH). I understand that dealing with healthcare issues can be stressful.\n\nCould you tell me what happened? I'm here to listen and help resolve your concern. You might want to mention things like:\n\n• Wait times or appointment issues\n• Concerns about your medical care\n• Billing or payment questions\n• Communication with our staff\n\nPlease share what's on your mind, and I'll do my best to help.`;
    
    return {
      needsMoreInfo: true,
      messages: [...state.messages, new AIMessage(clarifyMessage)],
    };
  }

  return {
    needsMoreInfo: false,
  };
}

/**
 * Node 1: classifyComplaint
 * LLM node that analyzes user input and classifies complaint domain + subcategory
 * Also extracts any relevant field values mentioned in the initial complaint
 */
export async function classifyComplaint(state: GraphState): Promise<Partial<GraphState>> {
  const lastMessage = state.messages[state.messages.length - 1];
  const userInput = lastMessage?.content?.toString() || "";

  const classifyPrompt = `You are a hospital complaint intake specialist. Analyze this complaint, classify it, and extract any specific details mentioned.

Available Domains:
- CLINICAL: Issues with medical care, diagnosis, treatment, medication, procedures
- MANAGEMENT: Issues with wait times, billing, appointments, facilities, admin processes
- RELATIONSHIP: Issues with staff communication, attitude, respect, professionalism

Available Subcategories:
MANAGEMENT: WAIT_TIME, BILLING, APPOINTMENT, FACILITIES, ADMIN_PROCESS
RELATIONSHIP: COMMUNICATION, ATTITUDE, RESPECT, PROFESSIONALISM
CLINICAL: MEDICATION, DIAGNOSIS, PROCEDURE, SAFETY, FOLLOW_UP

User Complaint:
"${userInput}"

IMPORTANT: Extract any specific details already mentioned (dates, amounts, names, locations, etc.)

Respond ONLY with JSON:
{
  "domain": "CLINICAL" | "MANAGEMENT" | "RELATIONSHIP",
  "subcategory": "<subcategory>",
  "description": "<brief summary>",
  "extractedFields": {
    "eventDate": "<if date mentioned>",
    "eventLocation": "<if location mentioned>",
    "typeOfCare": "<OUTPATIENT/INPATIENT/EMERGENCY/DAY_SURGERY if mentioned>",
    "billingAmount": "<if amount mentioned>",
    "insuranceStatus": "<if insurance mentioned>",
    "medicationName": "<if medication mentioned>",
    "staffRole": "<if staff role mentioned>",
    "impact": "<if impact mentioned: EMOTIONAL/PHYSICAL/FINANCIAL/DELAY_IN_CARE>"
  }
}

Only include extractedFields that were explicitly mentioned. Omit fields not mentioned.`;

  const response = await llm.invoke(classifyPrompt);
  const content = response.content.toString();
  
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in LLM response");
    }
    
    const classification = JSON.parse(jsonMatch[0]);
    
    if (!classification.domain || !classification.subcategory) {
      throw new Error("Missing domain or subcategory in classification");
    }
    
    // Build complaint object with extracted fields
    const complaint: any = {
      ...state.complaint,
      domain: classification.domain as ComplaintDomain,
      subcategory: classification.subcategory as ComplaintSubcategory,
      description: classification.description,
    };

    // Map extracted fields to complaint structure
    const extracted = classification.extractedFields || {};
    
    // Set default location to SGH - all complaints are at Singapore General Hospital
    complaint.event = {
      location: "Singapore General Hospital (SGH)",
    };
    
    if (extracted.eventDate) {
      complaint.event.date = extracted.eventDate;
    }
    
    if (extracted.typeOfCare) {
      complaint.typeOfCare = extracted.typeOfCare;
    }
    
    if (extracted.billingAmount || extracted.insuranceStatus) {
      complaint.billing = {};
      if (extracted.billingAmount) complaint.billing.amount = extracted.billingAmount;
      if (extracted.insuranceStatus) complaint.billing.insuranceStatus = extracted.insuranceStatus;
    }
    
    if (extracted.medicationName) {
      complaint.medication = { name: extracted.medicationName };
    }
    
    if (extracted.staffRole) {
      complaint.people = { role: extracted.staffRole };
    }
    
    if (extracted.impact) {
      complaint.impact = Array.isArray(extracted.impact) ? extracted.impact : [extracted.impact];
    }
    
    return { complaint };
  } catch (error) {
    console.error("Classification parsing error:", error, "\nLLM response:", content);
    const fallbackMessage = "I'm having trouble understanding your complaint. Could you provide more details about what happened?";
    return {
      needsMoreInfo: true,
      messages: [...state.messages, new AIMessage(fallbackMessage)],
    };
  }
}

/**
 * Node 2: determineMissingFields
 * LLM-based node that intelligently determines what additional information is needed
 * based on the specific complaint context (not rigid required fields)
 */
export async function determineMissingFields(state: GraphState): Promise<Partial<GraphState>> {
  const { complaint } = state;
  
  if (!complaint.subcategory) {
    return { missingFields: [] };
  }

  // Prepare current state summary
  const currentInfo = {
    domain: complaint.domain,
    subcategory: complaint.subcategory,
    description: complaint.description,
    eventDate: complaint.event?.date,
    eventLocation: complaint.event?.location,
    typeOfCare: complaint.typeOfCare,
    billingAmount: complaint.billing?.amount,
    insuranceStatus: complaint.billing?.insuranceStatus,
    medicationName: complaint.medication?.name,
    staffRole: complaint.people?.role,
    impact: complaint.impact,
    urgencyLevel: complaint.urgencyLevel,
  };

  // Remove undefined values
  const knownFields = Object.entries(currentInfo)
    .filter(([_, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ');

  const determinePrompt = `You are a hospital complaint intake specialist. Analyze what information we have and determine what ADDITIONAL information would be genuinely useful for properly handling this complaint.

**CRITICAL FOR ESCALATION**: Always try to collect:
1. event.date - When did this happen? (essential for investigation)
2. typeOfCare - What service/department? (routing to correct team)
3. people.role - Who was involved? (accountability)
4. impact - How did this affect the patient? (severity/urgency)

Complaint Type: ${complaint.subcategory} (${complaint.domain})

Information Already Collected:
${knownFields || 'Only basic complaint classification'}

Be SMART and CONTEXT-AWARE:
- For BILLING complaints: ONLY ask for amount if relevant. Insurance may not be needed for all billing issues
- For WAIT_TIME complaints: Ask for date, type of care (unless already provided)
- For MEDICATION complaints: Ask for medication name, date, impact
- For ATTITUDE/COMMUNICATION complaints: Ask for staff role involved
- For CLINICAL complaints: Ask for date, type of care, impact (as relevant)
- If the description is detailed and specific, we may NOT need more info
- Avoid asking for non-essential fields
- DO NOT ask for location - all complaints are at Singapore General Hospital (SGH)

Respond with JSON array of fields STILL NEEDED. Use these field names ONLY:
[
  "event.date",
  "typeOfCare",
  "billing.amount",
  "billing.insuranceStatus",
  "medication.name",
  "people.role",
  "impact"
]

IMPORTANT: DO NOT include "event.location" - it's always SGH

Examples:
- "My bill is $500" → ["billing.insuranceStatus"] OR [] (depends if insurance is relevant to the issue)
- "I was charged for the wrong procedure" → [] (description sufficient, no additional fields needed)
- "Long wait time yesterday" → ["typeOfCare"] (date already known, location is SGH)
- "Rude nurse" → ["people.role", "event.date"] (need specifics about who and when)
- "Rude nurse in the ER" → [] (already specific enough)
- "Doctor prescribed wrong medication" → ["medication.name"] (if not already mentioned)

IMPORTANT: Be selective. Don't ask for information that isn't truly necessary to handle the complaint.

Respond ONLY with JSON array: ["field1", "field2"] or [] if complete.`;

  try {
    const response = await llm.invoke(determinePrompt);
    const content = response.content.toString().trim();
    
    // Extract JSON array
    const jsonMatch = content.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) {
      console.warn("No JSON array found in determineMissingFields response:", content);
      return { missingFields: [] };
    }
    
    const missingFields = JSON.parse(jsonMatch[0]);
    
    return { missingFields: Array.isArray(missingFields) ? missingFields : [] };
  } catch (error) {
    console.error("Error determining missing fields:", error);
    // Fallback: no additional fields needed
    return { missingFields: [] };
  }
}

/**
 * Node 3: askClarifyingQuestion
 * LLM node that generates ONE natural language question for ONE missing field
 */
export async function askClarifyingQuestion(state: GraphState): Promise<Partial<GraphState>> {
  const { missingFields, complaint } = state;
  
  if (missingFields.length === 0) {
    return {};
  }

  // Pick the first missing field
  const fieldToAsk = missingFields[0];
  
  const questionPrompt = `You are a compassionate, empathetic hospital intake specialist helping a patient who may already be upset or frustrated. You need to collect one piece of information in a gentle, understanding way.

Complaint Type: ${complaint.subcategory}
Patient's Complaint: ${complaint.description}
Missing Field: ${fieldToAsk}

Generate a natural, warm, and empathetic question to collect this information. Show you understand they may be going through a difficult time.

Guidelines:
- Acknowledge their situation with empathy ("I understand this is frustrating...")
- Keep it brief (1-2 sentences)
- Make it conversational and warm
- Let them know they can skip if needed

Examples:
- For "event.date": "I understand this was a difficult experience. When did this happen?"
- For "typeOfCare": "What type of service or appointment was this at SGH? For example: Emergency Department, Specialist Clinic, Surgery, Day Surgery, Dialysis, or Laboratory?"
- For "billing.amount": "I'm sorry you're dealing with a billing issue. What was the amount you were charged?"
- For "medication.name": "To make sure we investigate this thoroughly, could you share which medication was involved?"
- For "people.role": "Could you tell me who you were interacting with - was it a doctor, nurse, or someone else?"
- For "typeOfCare": "What type of service or appointment was this at SGH? For example: Emergency Department, Specialist Clinic, Surgery, Day Surgery, Dialysis, Endoscopy, Laboratory, Pharmacy, or Inpatient Ward?"
- For "impact": "I'm sorry this happened. How has this situation affected you?"

Generate ONLY the question, nothing else.`;

  const response = await llm.invoke(questionPrompt);
  const question = response.content.toString().trim();

  // Add assistant message to history
  const updatedMessages = [...state.messages, new AIMessage(question)];

  return {
    currentQuestion: question,
    messages: updatedMessages,
  };
}

/**
 * Node 3b: interpretUserResponse
 * LLM node that interprets if user's response is:
 * - An answer to the question
 * - A clarifying question (asking for explanation)
 * - "I don't know" or "not applicable"
 */
export async function interpretUserResponse(state: GraphState): Promise<Partial<GraphState>> {
  const t0 = Date.now();
  const lastMessage = state.messages[state.messages.length - 1];
  const userResponse = lastMessage?.content?.toString() || "";
  const { currentQuestion, missingFields } = state;

  // OPTIMIZATION: Quick pattern check before LLM call
  // If user is clearly asking a question, skip LLM and go straight to clarification
  const questionPatterns = [
    /what do (you|u) mean/i,
    /what is (that|this)/i,
    /what does (that|this) mean/i,
    /i don'?t understand/i,
    /can you explain/i,
    /what'?s (that|this)/i,
  ];
  
  const skipPatterns = [
    /i don'?t know/i,
    /not sure/i,
    /skip/i,
    /not applicable/i,
    /n\/a/i,
  ];

  // Fast path: User is clearly asking for clarification
  if (questionPatterns.some(pattern => pattern.test(userResponse))) {
    const field = missingFields?.[0] || "";
    let explanation = "";

    if (field.includes("typeOfCare")) {
      explanation = `I understand you need clarification. "Type of care" refers to the kind of service or department you visited at SGH - for example:\n- Emergency Department\n- Specialist Clinic (Cardiology, Orthopaedic, ENT, etc.)\n- Outpatient Appointment\n- Surgery or Day Surgery\n- Endoscopy\n- Dialysis (Haemodialysis or Peritoneal)\n- Laboratory/Blood Test\n- Radiology/Imaging (X-ray, MRI, CT scan)\n- Pharmacy\n- Inpatient Ward\n\nJust tell me which department or service you were visiting in your own words. If you're not sure, that's completely fine - we can move on.`;
    } else if (field.includes("insurance")) {
      explanation = `I'm happy to explain. Health insurance is the coverage that helps pay for medical costs. This could be:\n- Employer insurance\n- Government programs (Medicare, Medicaid)\n- Private insurance\n- Or no insurance\n\nIf you don't have this information or prefer not to answer, that's perfectly okay.`;
    } else if (field.includes("billing.amount")) {
      explanation = `Of course. I'm asking about the dollar amount on your bill or charge. If you don't have the bill handy or don't remember the exact amount, no worries - we can skip this.`;
    } else if (field.includes("event.date")) {
      explanation = `I'm asking when this happened - the date of your appointment or when the issue occurred. You can say it however is easiest for you, like "yesterday", "June 24", or "last Tuesday".`;
    } else if (field.includes("medication.name")) {
      explanation = `I'm asking for the name of the medication involved. If you don't remember the exact name, you can describe it (like "the blood pressure pill" or "the painkiller") or we can skip this.`;
    } else if (field.includes("people.role")) {
      explanation = `I'm asking who you were dealing with - for example: doctor, nurse, receptionist, billing staff, etc. Just describe them in your own words.`;
    } else if (field.includes("impact")) {
      explanation = `I'm asking how this situation affected you. For example: did it cause pain, stress, financial burden, delayed treatment, or other consequences? Share what feels relevant to you.`;
    } else {
      explanation = `I understand you need clarification. If you're not sure how to answer or don't have this information, that's completely okay - just let me know and we can move on.`;
    }

    console.log(`[interpretUserResponse] ${Date.now() - t0}ms - Fast path: CLARIFY detected`);
    return {
      messages: [...state.messages, new AIMessage(explanation)],
    };
  }
  
  // Fast path: User wants to skip
  if (skipPatterns.some(pattern => pattern.test(userResponse))) {
    const updatedMissingFields = missingFields?.slice(1) || [];
    console.log(`[interpretUserResponse] ${Date.now() - t0}ms - Fast path: SKIP detected`);
    return {
      missingFields: updatedMissingFields,
    };
  }

  // Fast path: If response is > 3 words and not a question, assume it's an answer
  const wordCount = userResponse.split(/\s+/).length;
  if (wordCount >= 3 && !userResponse.includes('?')) {
    console.log(`[interpretUserResponse] ${Date.now() - t0}ms - Fast path: ANSWER detected (${wordCount} words)`);
    return {}; // Proceed to update (ANSWER)
  }

  // Fallback to LLM only for ambiguous cases
  const interpretPrompt = `You are analyzing a user's response to a question in a hospital complaint intake process.

Question Asked: "${currentQuestion}"
User's Response: "${userResponse}"

Determine the intent of the user's response:
- "ANSWER": User is providing an answer to the question
- "CLARIFY": User is asking what the question means or needs clarification
- "SKIP": User says "I don't know", "not applicable", "skip", etc.

Respond with ONLY ONE WORD: ANSWER, CLARIFY, or SKIP`;

  const response = await llm.invoke(interpretPrompt);
  const intent = response.content.toString().trim().toUpperCase();

  if (intent.includes("CLARIFY")) {
    return await provideFieldExplanation(missingFields?.[0] || "", state);
  }

  if (intent.includes("SKIP")) {
    const updatedMissingFields = missingFields?.slice(1) || [];
    return {
      missingFields: updatedMissingFields,
    };
  }

  // ANSWER - proceed with normal extraction
  return {};
}

/**
 * Helper function to provide field explanations (extracted for reuse)
 */
async function provideFieldExplanation(field: string, state: GraphState): Promise<Partial<GraphState>> {
    // User needs clarification - provide warm, helpful explanation
    let explanation = "";

    if (field.includes("typeOfCare")) {
      explanation = `I understand you need clarification. "Type of care" refers to the kind of service or department you visited at SGH - for example:\n- Emergency Department\n- Specialist Clinic (Cardiology, Orthopaedic, ENT, etc.)\n- Outpatient Appointment\n- Surgery or Day Surgery\n- Endoscopy\n- Dialysis (Haemodialysis or Peritoneal)\n- Laboratory/Blood Test\n- Radiology/Imaging (X-ray, MRI, CT scan)\n- Pharmacy\n- Inpatient Ward\n\nJust tell me which department or service you were visiting in your own words. If you're not sure, that's completely fine - we can move on.`;
    } else if (field.includes("insurance")) {
      explanation = `I'm happy to explain. Health insurance is the coverage that helps pay for medical costs. This could be:\n- Employer insurance\n- Government programs (Medicare, Medicaid)\n- Private insurance\n- Or no insurance\n\nIf you don't have this information or prefer not to answer, that's perfectly okay.`;
    } else if (field.includes("billing.amount")) {
      explanation = `Of course. I'm asking about the dollar amount on your bill or charge. If you don't have the bill handy or don't remember the exact amount, no worries - we can skip this.`;
    } else if (field.includes("event.date")) {
      explanation = `I'm asking when this happened - the date of your appointment or when the issue occurred. You can say it however is easiest for you, like "yesterday", "June 24", or "last Tuesday".`;
    } else if (field.includes("medication.name")) {
      explanation = `I'm asking for the name of the medication involved. If you don't remember the exact name, you can describe it (like "the blood pressure pill" or "the painkiller") or we can skip this.`;
    } else if (field.includes("people.role")) {
      explanation = `I'm asking who you were dealing with - for example: doctor, nurse, receptionist, billing staff, etc. Just describe them in your own words.`;
    } else if (field.includes("impact")) {
      explanation = `I'm asking how this situation affected you. For example: did it cause pain, stress, financial burden, delayed treatment, or other consequences? Share what feels relevant to you.`;
    } else {
      explanation = `I understand you need clarification. If you're not sure how to answer or don't have this information, that's completely okay - just let me know and we can move on.`;
    }

    return {
      messages: [...state.messages, new AIMessage(explanation)],
    };
}

/**
 * Node 4: validateExtractedData
 * HYBRID VALIDATION: Rule-based (fast) + LLM fallback (flexible)
 * Strategy: Try rule-based validation first for structured data, fall back to LLM for complex cases
 */
export async function validateExtractedData(state: GraphState): Promise<Partial<GraphState>> {
  const t0 = Date.now();
  const { complaint, missingFields, currentQuestion } = state;
  
  // OPTIMIZATION: Early exit if no fields to validate
  if (!currentQuestion || !missingFields || missingFields.length === 0) {
    return {};
  }
  
  // Get the last two messages (question + answer) - OPTIMIZATION: Not entire history
  const messages = state.messages;
  if (messages.length < 2) {
    return {};
  }
  
  const lastUserMessage = messages
    .filter((m) => m._getType?.() === 'human' || m.constructor.name === 'HumanMessage')
    .pop()
    ?.content?.toString() || "";
  
  const lastAgentMessage = messages
    .filter((m) => m._getType?.() === 'ai' || m.constructor.name === 'AIMessage')
    .pop()
    ?.content?.toString() || "";

  // Extract what was just collected (location is always SGH, no need to validate)
  const justExtracted = {
    eventDate: complaint.event?.date,
    typeOfCare: complaint.typeOfCare,
    billingAmount: complaint.billing?.amount,
    insuranceStatus: complaint.billing?.insuranceStatus,
    medicationName: complaint.medication?.name,
    staffRole: complaint.people?.role,
  };
  
  // STRATEGY 1: Rule-Based Validation (Fast, Cheap) ✅
  // Check if we're asking for a date field
  const dateFields = ['event.date', 'eventDate'];
  const amountFields = ['billing.amount', 'billingAmount'];
  const fieldBeingAsked = missingFields?.[0] || '';
  
  // Validate DATE fields with rule-based checks
  if (dateFields.some(f => fieldBeingAsked.includes(f)) || 
      lastAgentMessage.toLowerCase().includes('date') || 
      lastAgentMessage.toLowerCase().includes('when')) {
    const dateValidation = validateDate(lastUserMessage);
    if (!dateValidation.isValid) {
      console.log(`[validateExtracted] ${Date.now() - t0}ms - Rule-based date validation FAILED`);
      return {
        needsMoreInfo: true,
        currentQuestion: dateValidation.errorMessage, // Keep same field, ask again
        messages: [...state.messages, new AIMessage(dateValidation.errorMessage!)],
      };
    }
    console.log(`[validateExtracted] ${Date.now() - t0}ms - Rule-based date validation PASSED`);
  }
  
  // Validate AMOUNT fields with rule-based checks
  if (amountFields.some(f => fieldBeingAsked.includes(f)) || 
      lastAgentMessage.toLowerCase().includes('amount') || 
      lastAgentMessage.toLowerCase().includes('charge')) {
    const amountValidation = validateAmount(lastUserMessage);
    if (!amountValidation.isValid) {
      console.log(`[validateExtracted] Rule-based validation FAILED: ${amountValidation.errorMessage}`);
      return {
        needsMoreInfo: true,
        currentQuestion: amountValidation.errorMessage,
        messages: [...state.messages, new AIMessage(amountValidation.errorMessage!)],
      };
    }
    console.log(`[validateExtracted] Rule-based amount validation PASSED`);
  }
  
  // STRATEGY 2: LLM-Based Validation (Flexible) - Fallback for complex cases

  const validationPrompt = `You are a data quality specialist. Check if the user's answer matches what was asked.

AGENT'S QUESTION: "${lastAgentMessage}"
USER'S ANSWER: "${lastUserMessage}"

COMPLAINT TYPE: ${complaint.subcategory}

JUST EXTRACTED DATA:
${Object.entries(justExtracted).filter(([_, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n')}

CRITICAL VALIDATION CHECKS:
1. INVALID DATA CHECK - Is the data nonsensical or impossible?
   - "90 jun 2030" → INVALID (no 90th day in any month, max is 31)
   - "32 jan 2025" → INVALID (January only has 31 days)
   - "feb 30" → INVALID (February never has 30 days)
   - Dates with year 3000+ → INVALID (too far in future)
   - Negative amounts for billing → INVALID
   - Gibberish text → INVALID

2. CONTRADICTION CHECK - Did user give WRONG TYPE of data?
   - If asked for LOCATION but user gave a DATE (contains year/month/day) → INVALID
   - If asked for DATE but user gave a LOCATION (city/hospital name) → INVALID
   - If asked for NAME but user gave a NUMBER → INVALID

3. VAGUE CHECK - Is answer too vague?
   - "im angry" for impact → Ask for SPECIFIC impact
   - "SGH" for location → VALID (specific enough)
   - Single word for complex question → Might need clarification

4. COMPLETENESS CHECK - For certain complaint types:
   - APPOINTMENT with "wrong date" → Need BOTH wrong AND correct dates
   - BILLING with "wrong amount" → Need BOTH wrong AND correct amounts

Respond with JSON:
{
  "hasContradiction": true/false,
  "contradictionReason": "e.g., User gave date when asked for location",
  "isVague": true/false,
  "isInvalid": true/false,
  "invalidReason": "e.g., 90 is not a valid day (max 31)",
  "needsClarification": true/false,
  "clarificationQuestion": "The specific follow-up question to ask"
}

If hasContradiction=true OR isVague=true OR isInvalid=true OR needsClarification=true, provide clarificationQuestion.
Otherwise, clarificationQuestion should be null.`;

  try {
    const response = await llm.invoke(validationPrompt);
    const content = response.content.toString().trim();
    
    const jsonMatch = content.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      console.warn("No validation JSON found:", content);
      return {};
    }

    const validation = JSON.parse(jsonMatch[0]);
    
    console.log(`[validateExtractedData] ${Date.now() - t0}ms - LLM validation - hasContradiction: ${validation.hasContradiction}, isVague: ${validation.isVague}, isInvalid: ${validation.isInvalid}, needsClarification: ${validation.needsClarification}`);
    
    if (validation.hasContradiction || validation.isVague || validation.isInvalid || validation.needsClarification) {
      if (validation.clarificationQuestion) {
        console.log(`[validateExtractedData] LLM validation FAILED, re-asking: ${validation.clarificationQuestion.substring(0, 50)}`);
        return {
          needsMoreInfo: true,
          currentQuestion: validation.clarificationQuestion, // Keep same field, ask clarification
          messages: [...state.messages, new AIMessage(validation.clarificationQuestion)],
        };
      }
    }

    // Data is valid, proceed normally
    console.log(`[validateExtractedData] All validations PASSED`);
    return {};
  } catch (error) {
    console.error("Error validating extracted data:", error);
    return {};
  }
}

/**
 * Node 5: updateComplaintFromUserReply
 * LLM node that extracts structured info from user's reply and updates complaint
 */
export async function updateComplaintFromUserReply(state: GraphState): Promise<Partial<GraphState>> {
  const t0 = Date.now();
  const lastMessage = state.messages[state.messages.length - 1];
  const userReply = lastMessage?.content?.toString() || "";
  const { currentQuestion, complaint, missingFields } = state;

  if (!currentQuestion || !missingFields || missingFields.length === 0) {
    console.log(`[updateComplaint] ${Date.now() - t0}ms - Skipped (no fields to update)`);
    return {};
  }

  const fieldToUpdate = missingFields[0];
  if (!fieldToUpdate) {
    return {};
  }

  const extractPrompt = `You are extracting structured information from a user's response.

Question asked: "${currentQuestion}"
Field to extract: ${fieldToUpdate}
User's response: "${userReply}"

Extract the value for this field. If the user says "I don't know" or provides no useful info, respond with "UNKNOWN".

Respond ONLY with the extracted value, nothing else.`;

  const response = await llm.invoke(extractPrompt);
  const extractedValue = response.content.toString().trim();

  console.log(`[updateComplaint] ${Date.now() - t0}ms - Extracted: ${extractedValue.substring(0, 30)}`);

  // Update complaint object
  const updatedComplaint = { ...complaint };
  const [topLevel, subField] = fieldToUpdate.split(".");

  if (topLevel && subField) {
    // Update nested field
    const topLevelObj = (updatedComplaint[topLevel as keyof typeof updatedComplaint] as any) || {};
    topLevelObj[subField] = extractedValue !== "UNKNOWN" ? extractedValue : undefined;
    (updatedComplaint as any)[topLevel] = topLevelObj;
  } else if (topLevel) {
    // Update top-level field
    (updatedComplaint as any)[topLevel] = extractedValue !== "UNKNOWN" ? extractedValue : undefined;
  }

  return {
    complaint: updatedComplaint,
  };
}

/**
 * Node 5: generateFinalResponse
 * LLM node that generates patient-facing acknowledgement
 */
export async function generateFinalResponse(state: GraphState): Promise<Partial<GraphState>> {
  const { complaint } = state;

  const responsePrompt = `You are a compassionate hospital representative. Generate a brief, empathetic final response acknowledging the patient's complaint.

Complaint Details:
- Type: ${complaint.subcategory}
- Description: ${complaint.description}

Requirements:
- Acknowledge their concern
- Assure them it will be reviewed
- State next steps (human review/investigation)
- Be warm but professional
- Keep it to 2-3 sentences

Generate the response:`;

  const response = await llm.invoke(responsePrompt);
  const finalMessage = response.content.toString().trim();

  // Add to message history
  const updatedMessages = [...state.messages, new AIMessage(finalMessage)];

  return {
    messages: updatedMessages,
    isComplete: true,
    complaint: {
      ...complaint,
      needsHumanInvestigation: true,
    },
  };
}
