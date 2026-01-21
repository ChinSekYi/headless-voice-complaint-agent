import { AzureChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { GraphState } from "./graphState.js";
import { ComplaintDomain, ComplaintSubcategory } from "../config/complaintSchema.js";
import { HOSPITAL_CONFIG } from "../config/hospitalContext.js";
// Removed unused imports: RequiredFieldsBySubcategory, SGH_TYPES_OF_CARE

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

// Type-of-care options used across prompts for consistency
const TYPE_OF_CARE_OPTIONS = [
  "1. Emergency Department",
  "2. Specialist Clinic (Cardiology, Orthopaedic, ENT, etc.)",
  "3. Surgery or Day Surgery",
  "4. Endoscopy",
  "5. Dialysis (Haemodialysis or Peritoneal)",
  "6. Laboratory/Blood Test",
  "7. Radiology/Imaging (X-ray, MRI, CT scan)",
  "8. Pharmacy",
  "9. Inpatient Ward",
  "10. Other (please specify)",
];

function renderTypeOfCareOptionsText(): string {
  return TYPE_OF_CARE_OPTIONS.join('\n');
}

// Impact options for structured prompting
const IMPACT_OPTIONS = [
  "1. Physical symptoms worsened or new symptoms",
  "2. Emotional stress or anxiety",
  "3. Financial cost or unexpected charges",
  "4. Treatment delay or missed care",
  "5. Daily life affected (work/school/family)",
  "6. Safety risk or harm",
  "7. Other (please describe)",
];

// Normalize whitespace and punctuation
function normalizeInput(text: string): string {
  return (text || "").toLowerCase().trim();
}

// Map free text or numeric selection to a canonical typeOfCare value
function mapTypeOfCareInputToValue(input: string): string | null {
  const raw = normalizeInput(input);
  const numMatch = raw.match(/^(\d{1,2})/);
  if (numMatch) {
    const n = parseInt(numMatch[1]!, 10);
    const mapping: Record<number, string> = {
      1: "Emergency Department",
      2: "Specialist Clinic",
      3: "Surgery",
      4: "Endoscopy",
      5: "Dialysis",
      6: "Laboratory/Blood Test",
      7: "Radiology/Imaging",
      8: "Pharmacy",
      9: "Inpatient Ward",
    };
    if (mapping[n]) return mapping[n];
  }
  const synonyms: Array<{canonical: string; keys: string[]}> = [
    { canonical: "Emergency Department", keys: ["emergency","ed","er","a&e","accident and emergency"] },
    { canonical: "Specialist Clinic", keys: ["specialist","clinic","outpatient"] },
    { canonical: "Surgery", keys: ["surgery","operation","op","day surgery"] },
    { canonical: "Endoscopy", keys: ["endoscopy","scope","gastroscopy","colonoscopy"] },
    { canonical: "Dialysis", keys: ["dialysis","haemodialysis","hemodialysis","peritoneal","pd","hd"] },
    { canonical: "Laboratory/Blood Test", keys: ["laboratory","lab","blood test","phlebotomy"] },
    { canonical: "Radiology/Imaging", keys: ["radiology","imaging","x-ray","xray","mri","ct","scan","ultrasound"] },
    { canonical: "Pharmacy", keys: ["pharmacy","dispensary","medication collection"] },
    { canonical: "Inpatient Ward", keys: ["inpatient","ward","admission","hospitalised","hospitalized","stay"] },
  ];
  for (const item of synonyms) {
    if (item.keys.some(k => raw.includes(k))) return item.canonical;
  }
  return null;
}

// Map free text or numeric selection to a canonical impact value
function mapImpactInputToValue(input: string): string | null {
  const raw = normalizeInput(input);
  const numMatch = raw.match(/^(\d{1,2})/);
  if (numMatch) {
    const n = parseInt(numMatch[1]!, 10);
    const mapping: Record<number, string> = {
      1: "Physical symptoms worsened or new symptoms",
      2: "Emotional stress or anxiety",
      3: "Financial cost or unexpected charges",
      4: "Treatment delay or missed care",
      5: "Daily life affected (work/school/family)",
      6: "Safety risk or harm",
      7: "Other (please describe)",
    };
    if (mapping[n]) return mapping[n];
  }
  const synonyms: Array<{canonical: string; keys: string[]}> = [
    { canonical: "Physical symptoms worsened or new symptoms", keys: ["sicker","worse","pain","side effect","dizzy","nausea","vomit","rash","symptom"] },
    { canonical: "Emotional stress or anxiety", keys: ["stress","anxiety","upset","angry","frustrated","worried","depressed"] },
    { canonical: "Financial cost or unexpected charges", keys: ["cost","money","charge","bill","expensive","paid","payment"] },
    { canonical: "Treatment delay or missed care", keys: ["delay","postponed","missed","reschedule","late","pushed"] },
    { canonical: "Daily life affected (work/school/family)", keys: ["work","school","family","caregiving","commute","time","leave"] },
    { canonical: "Safety risk or harm", keys: ["risk","harm","danger","unsafe","safety"] },
  ];
  for (const item of synonyms) {
    if (item.keys.some(k => raw.includes(k))) return item.canonical;
  }
  if (raw.includes("other")) return "Other (please describe)";
  return null;
}

function validateDate(dateString: string): ValidationResult {
  // Check for obviously invalid dates
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
  
  // Reject clearly future dates (complaints are about past events). Allow a small +3 day tolerance for scheduling phrasing.
  const parsedTimestamp = Date.parse(dateString);
  if (!Number.isNaN(parsedTimestamp)) {
    const inputDate = new Date(parsedTimestamp);
    const now = new Date();
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    if (inputDate.getTime() - now.getTime() > threeDaysMs) {
      return {
        isValid: false,
        errorMessage: `That date seems to be in the future. Could you share when this actually happened? (e.g., "12 Jun 2025")`,
      };
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
    const clarifyMessage = `Hello — I'm here to help with any concerns about your experience at Singapore General Hospital (SGH). I know this can be stressful, and I’ll make this as easy as possible.\n\nTo help us act quickly, please share a short but detailed description in one message. It helps to include:\n\n• When it happened (date/time)\n• Service or department (e.g., Emergency, Specialist Clinic, Surgery, Dialysis, Laboratory, Pharmacy, Ward)\n• Who was involved (doctor, nurse, receptionist, etc.)\n• What happened (the specific issue)\n• How it affected you (e.g., stress, missed work, pain, extra cost)\n\nExample:\n“I had an appointment on 12 Jun 2026 at the Orthopaedic Specialist Clinic. My printed date showed 23 Jun 2026 instead. I spoke with the receptionist and was told to rebook. This caused me to miss half a day of work and reschedule my physiotherapy.”\n\nShare whatever you remember, and we’ll fill in the rest together.`;
    
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
    
    // Set default location from config, but allow override if user provides a different location
    complaint.event = {
      location: HOSPITAL_CONFIG.defaultLocation,
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
    
    // Add one-shot detail nudge to reduce back-and-forth
    const expectationMessage = `Thank you for sharing this. I know situations like this can be stressful, and I'll make this as easy as possible.\n\nTo help us act quickly, please share a short but detailed description in one message (if you haven’t already). It helps to include:\n\n• When it happened (date/time)\n• Service or department (e.g., Emergency, Specialist Clinic, Surgery, Dialysis, Laboratory, Pharmacy, Ward)\n• Who was involved (doctor, nurse, receptionist, etc.)\n• What happened (the specific issue)\n• How it affected you (e.g., stress, missed work, pain, extra cost)\n\nExample:\n"I had an appointment on 12 Jun at the Orthopaedic Specialist Clinic. My printed date showed 23 Jun instead. I spoke with the receptionist and was told to rebook. This caused me to miss half a day of work and reschedule my physiotherapy."`;
    
    return { 
      complaint,
      messages: [...state.messages, new AIMessage(expectationMessage)],
    };
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
5. event.location - ONLY if the user mentions wrong location, different facility, or unclear venue (otherwise default to the hospital config)

**CONTACT DETAILS (REQUIRED FOR FOLLOW-UP)**: After collecting complaint details, ALWAYS collect:
- contactDetails.name - Complainant's name (required)
- contactDetails.email - Email address (required)
- contactDetails.contactNo - Contact number (required)
- contactDetails.isPatient - Are they the patient? (required - true/false)
- contactDetails.wantsContact - Do they want us to contact them? (required - true/false)
- contactDetails.address - Address (optional, skip if they don't provide)

Complaint Type: ${complaint.subcategory} (${complaint.domain})

Information Already Collected:
${knownFields || 'Only basic complaint classification'}

Be SMART and CONTEXT-AWARE:
- For BILLING complaints: ONLY ask for amount if relevant. Insurance may not be needed for all billing issues
- For WAIT_TIME complaints: Ask for date, type of care (unless already provided)
- For MEDICATION complaints: Ask for medication name, date, impact
- For ATTITUDE/COMMUNICATION complaints: Ask for staff role involved
- For CLINICAL complaints: Ask for date, type of care, impact (as relevant)
- LOCATION: default is the primary hospital, but if the user mentions wrong location, other facility, or unclear venue, collect event.location
- If the description is detailed and specific, we may NOT need more info
- Avoid asking for non-essential fields
- ALWAYS collect contact details at the end (name, email, contact number, isPatient, wantsContact)

Respond with JSON array of fields STILL NEEDED. Use these field names ONLY:
[
  "event.date",
  "typeOfCare",
  "billing.amount",
  "billing.insuranceStatus",
  "medication.name",
  "people.role",
  "impact",
  "contactDetails.name",
  "contactDetails.email",
  "contactDetails.contactNo",
  "contactDetails.isPatient",
  "contactDetails.wantsContact",
  "contactDetails.address"
]

IMPORTANT: Include "event.location" ONLY when the user hints at wrong/other/unclear location

Examples:
- "My bill is $500" → ["billing.insuranceStatus"] OR [] (depends if insurance is relevant to the issue)
- "I was charged for the wrong procedure" → [] (description sufficient, no additional fields needed)
- "Long wait time yesterday" → ["typeOfCare"] (date already known)
- "Rude nurse" → ["people.role", "event.date"] (need specifics about who and when)
- "Rude nurse in the ER" → [] (already specific enough)
- "Doctor prescribed wrong medication" → ["medication.name"] (if not already mentioned)

IMPORTANT: Be selective. Don't ask for information that isn't truly necessary to handle the complaint.
ALWAYS include contact detail fields at the end if not yet collected.

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
    
    console.log(`[determineMissingFields] LLM requested fields: [${missingFields.join(', ')}]`);
    
    return { missingFields: Array.isArray(missingFields) ? missingFields : [] };
  } catch (error) {
    console.error("Error determining missing fields:", error);
    // Fallback: no additional fields needed
    return { missingFields: [] };
  }
}

export async function askClarifyingQuestion(state: GraphState): Promise<Partial<GraphState>> {
  const { missingFields, complaint } = state;
  
  if (missingFields.length === 0) {
    console.log(`[askClarifyingQuestion] No missing fields, skipping question`);
    return {};
  }

  // Pick the first missing field
  const fieldToAsk = missingFields[0];
  if (!fieldToAsk) {
    return {};
  }
  
  const fieldAttempts: Record<string, number> = state.fieldAttempts || {};
  const currentAttempts = fieldAttempts[fieldToAsk] || 0;
  
  console.log(`[askClarifyingQuestion] Asking for field: "${fieldToAsk}" (attempt ${currentAttempts + 1}), remaining: [${missingFields.slice(1).join(', ')}]`);
  
  // If we've already asked twice and they still can't answer, skip this field
  if (currentAttempts >= 2) {
    console.log(`[askClarifyingQuestion] Field "${fieldToAsk}" attempted ${currentAttempts} times, SKIPPING`);
    const updatedAttempts: Record<string, number> = { ...fieldAttempts };
    updatedAttempts[fieldToAsk] = 0;
    return {
      missingFields: missingFields.slice(1), // Remove this field and move on
      fieldAttempts: updatedAttempts, // Reset counter
    };
  }

  // Check if this is the first question (no attempts yet on any field) - use bundled empathetic approach
  const isFirstQuestion = Object.keys(fieldAttempts).length === 0 || Object.values(fieldAttempts).every(v => v === 0);
  
  if (isFirstQuestion && missingFields.length >= 2) {
    // Bundle multiple related questions with empathy for better UX
    const empathyMap: Record<string, string> = {
      'ATTITUDE': "I'm sorry you experienced that.",
      'COMMUNICATION': "I'm sorry you experienced that.",
      'MEDICATION': "I'm sorry to hear about this medication concern.",
      'WAIT_TIME': "I understand waiting can be frustrating.",
      'BILLING': "I understand billing concerns can be stressful.",
      'APPOINTMENT': "I'm sorry about the issue with your appointment.",
      'CLINICAL': "I'm sorry to hear about your clinical concern.",
      'FACILITY': "I'm sorry about the facility issue you experienced.",
    };
    
    const empathyPrefix = empathyMap[complaint.domain as string] || "I'm sorry this happened.";
    
    // Build bullet list of what we need
    const fieldDescriptions: Record<string, string> = {
      'event.date': 'When did this happen?',
      'event.location': 'Where exactly did this occur?',
      'typeOfCare': 'Which department or service? (Emergency, Clinic, Ward, etc.)',
      'people.role': 'Who was involved? (role or name if known)',
      'medication.name': 'Which medication was involved?',
      'billing.amount': 'What was the amount charged?',
      'billing.insuranceStatus': 'Insurance coverage details (if relevant)',
      'impact': 'How did this affect you?',
      'contactDetails.name': 'Your name',
      'contactDetails.email': 'Your email address',
      'contactDetails.contactNo': 'Your contact number',
      'contactDetails.isPatient': 'Are you the patient? (Yes/No)',
      'contactDetails.wantsContact': 'Would you like us to contact you? (Yes/No)',
      'contactDetails.address': 'Your address (optional)',
    };
    
    const fieldsToAsk = missingFields.slice(0, 4); // Ask up to 4 fields at once
    const bulletPoints = fieldsToAsk
      .map(f => `• ${fieldDescriptions[f] || f}`)
      .join('\n');
    
    const question = `${empathyPrefix} To help us investigate and provide feedback, could you share:\n\n${bulletPoints}\n\nShare what you remember - approximate details are fine.`;
    
    const updatedMessages = [...state.messages, new AIMessage(question)];
    const updatedAttempts: Record<string, number> = { ...fieldAttempts };
    updatedAttempts[fieldToAsk] = currentAttempts + 1;
    
    return {
      currentQuestion: question,
      messages: updatedMessages,
      fieldAttempts: updatedAttempts,
    };
  }

  // OPTIMIZATION: For typeOfCare, provide dropdown-style options instead of open-ended question
  if (fieldToAsk === "typeOfCare") {
    const question = `To route your concern to the right department, could you tell me which service or department this was related to?\n\n${renderTypeOfCareOptionsText()}\n\nYou can reply with the number or name.`;
    
    const updatedMessages = [...state.messages, new AIMessage(question)];
    const updatedAttempts: Record<string, number> = { ...fieldAttempts };
    updatedAttempts[fieldToAsk] = currentAttempts + 1;
    
    return {
      currentQuestion: question,
      messages: updatedMessages,
      fieldAttempts: updatedAttempts,
    };
  }
  
  // NEW: For impact, provide dropdown-style options to reduce ambiguity
  if (fieldToAsk === "impact") {
    const question = `I'm sorry this happened. How did this affect you?\n\n${IMPACT_OPTIONS.join('\n')}\n\nYou can reply with the number, a few words, or skip.`;
    const updatedMessages = [...state.messages, new AIMessage(question)];
    const updatedAttempts: Record<string, number> = { ...fieldAttempts };
    updatedAttempts[fieldToAsk] = currentAttempts + 1;
    
    return {
      currentQuestion: question,
      messages: updatedMessages,
      fieldAttempts: updatedAttempts,
    };
  }
  
  // Handle contact detail fields - bundle them together for better UX
  const contactFields = ['contactDetails.name', 'contactDetails.email', 'contactDetails.contactNo', 'contactDetails.isPatient', 'contactDetails.wantsContact'];
  if (contactFields.includes(fieldToAsk)) {
    // Check how many contact fields are still missing
    const missingContactFields = missingFields.filter(f => contactFields.includes(f));
    
    if (missingContactFields.length >= 3) {
      // Ask for all main contact details at once
      const question = `Thank you for sharing this information. To help us follow up with you, could you please provide:\n\n• Your name\n• Your email address\n• Your contact number\n• Are you the patient? (Yes/No)\n• Would you like us to contact you about this? (Yes/No)\n\nYou can share these details in any format.`;
      
      const updatedMessages = [...state.messages, new AIMessage(question)];
      const updatedAttempts: Record<string, number> = { ...fieldAttempts };
      updatedAttempts[fieldToAsk] = currentAttempts + 1;
      
      return {
        currentQuestion: question,
        messages: updatedMessages,
        fieldAttempts: updatedAttempts,
      };
    }
  }
  
  // Handle isPatient yes/no question
  if (fieldToAsk === "contactDetails.isPatient") {
    const question = `Are you the patient, or are you submitting this feedback on behalf of someone else?`;
    const updatedMessages = [...state.messages, new AIMessage(question)];
    const updatedAttempts: Record<string, number> = { ...fieldAttempts };
    updatedAttempts[fieldToAsk] = currentAttempts + 1;
    
    return {
      currentQuestion: question,
      messages: updatedMessages,
      fieldAttempts: updatedAttempts,
    };
  }
  
  // Handle wantsContact yes/no question
  if (fieldToAsk === "contactDetails.wantsContact") {
    const question = `Would you like us to contact you regarding this feedback?`;
    const updatedMessages = [...state.messages, new AIMessage(question)];
    const updatedAttempts: Record<string, number> = { ...fieldAttempts };
    updatedAttempts[fieldToAsk] = currentAttempts + 1;
    
    return {
      currentQuestion: question,
      messages: updatedMessages,
      fieldAttempts: updatedAttempts,
    };
  }
  
  // For other fields, use empathetic single-field question
  const questionPrompt = `You are an empathetic hospital intake specialist. Generate a brief, caring question to collect this information.

Complaint Type: ${complaint.subcategory}
Patient's Complaint: ${complaint.description}
Field needed: ${fieldToAsk}

Generate a SHORT question (10-15 words). Make it empathetic and natural:
- Start with brief empathy when appropriate: "I'm sorry about that."
- Then ask clearly: "Could you share [the specific detail]?"
- Be conversational and human

Examples:
- "I understand. When did this happen?"
- "Could you tell me which medication this was?"
- "Who did you speak with about this?"
- "What was the amount on the bill?"
- "Which department or service was this in?"

Generate ONLY the question, nothing else.`;

  const response = await llm.invoke(questionPrompt);
  const question = response.content.toString().trim();

  // Add assistant message to history
  const updatedMessages = [...state.messages, new AIMessage(question)];

  const updatedAttempts: Record<string, number> = { ...fieldAttempts };
  updatedAttempts[fieldToAsk] = currentAttempts + 1;
  
  return {
    currentQuestion: question,
    messages: updatedMessages,
    fieldAttempts: updatedAttempts,
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
    /i do not know/i,
    /\bidk\b/i,
    /not sure/i,
    /unsure/i,
    /no idea/i,
    /prefer not to say/i,
    /rather not say/i,
    /skip/i,
    /pass/i,
    /not applicable/i,
    /n\/a/i,
  ];

  // Fast path: User is clearly asking for clarification
  if (questionPatterns.some(pattern => pattern.test(userResponse))) {
    const field = missingFields?.[0] || "";
    let explanation = "";

    if (field.includes("typeOfCare")) {
      explanation = `I understand you need clarification. I'm asking which service or department you visited at SGH. Here are the main options:\n\n${renderTypeOfCareOptionsText()}\n\nYou can reply with the number or the name of the service. If you're not sure, that's completely fine - just give your best guess or we can move on.`;
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
    const ack = "No worries, we'll skip that and move on.";
    return {
      missingFields: updatedMissingFields,
      currentQuestion: undefined,
      messages: [...state.messages, new AIMessage(ack)],
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
      explanation = `I understand you need clarification. I'm asking which service or department you visited at SGH. Here are the main options:\n\n${renderTypeOfCareOptionsText()}\n\nYou can reply with the number or the name of the service. If you're not sure, that's completely fine - just give your best guess or we can move on.`;
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

  // Fast path: Handle simple yes/no confirmations to avoid re-asking the same question
  const confirmQuestionPattern = /(just to confirm|is this (?:correct|accurate)|please confirm|does this look right|is that (?:correct|accurate))/i;
  const affirmativePattern = /^(yes|yup|yeah|ya|y|correct|that's right|thats right|exactly|affirmative|sure|ok|okay)$/i;
  const negativePattern = /^(no|nope|nah|n|not really|incorrect|that's wrong|thats wrong|not correct)$/i;
  if (confirmQuestionPattern.test(lastAgentMessage)) {
    const trimmed = lastUserMessage.trim().toLowerCase();
    if (affirmativePattern.test(trimmed)) {
      console.log(`[validateExtractedData] ${Date.now() - t0}ms - Fast confirm: affirmative acknowledged`);
      return {};
    }
    if (negativePattern.test(trimmed)) {
      const followUp = `Thanks for clarifying. Could you share the correct details?`;
      console.log(`[validateExtractedData] ${Date.now() - t0}ms - Fast confirm: negative, asking for correction`);
      return {
        needsMoreInfo: true,
        currentQuestion: followUp,
        messages: [...state.messages, new AIMessage(followUp)],
      };
    }
  }

  // Extract what was just collected (location defaults to config but can be overridden)
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

      // Clear any previously stored date so an invalid future/past value doesn't linger
      const cleanedComplaint = { ...state.complaint } as any;
      if (cleanedComplaint.event) {
        if (cleanedComplaint.event.date !== undefined) {
          const { date, ...rest } = cleanedComplaint.event;
          cleanedComplaint.event = { ...rest };
        }
      }
      const preservedMissing = state.missingFields || [];

      return {
        needsMoreInfo: true,
        currentQuestion: dateValidation.errorMessage, // Keep same field, ask again
        messages: [...state.messages, new AIMessage(dateValidation.errorMessage!)],
        complaint: cleanedComplaint,
        missingFields: preservedMissing.length ? preservedMissing : [fieldBeingAsked],
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
  
  // NEW: Accept impact answers without LLM validation to reduce back-and-forth
  if (fieldBeingAsked.includes('impact') || lastAgentMessage.toLowerCase().includes('affect')) {
    console.log(`[validateExtracted] ${Date.now() - t0}ms - ✓ Impact field detected, SKIPPING LLM validation`);
    console.log(`[validateExtracted] Field: "${fieldBeingAsked}", Last msg contains 'affect': ${lastAgentMessage.toLowerCase().includes('affect')}`);
    return {};
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
  - "im angry" for impact → Ask for SPECIFIC impact (how did it affect you physically/emotionally?)
  - "nurse i think" or "doctor maybe" → VALID (uncertainty is OK, the role is clear)
  - "SGH" for location → VALID (specific enough)
  - Single word for complex question → Might need clarification

4. COMPLETENESS CHECK - For certain complaint types:
  - APPOINTMENT: Ask for appointment date once. If user explicitly says "wrong date", then ask for both the original (wrong) and correct dates; otherwise, avoid re-asking dates. If user mentions wrong location, focus on location/department instead of repeating date questions.
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
        
          // Provide helpful guidance based on field type and attempt count
          const fieldAttempts = state.fieldAttempts || {};
          const currentAttempts = fieldAttempts[fieldBeingAsked] || 0;

        // If the contradiction/invalid is about event.date, clear stored date so the next answer can override cleanly
        let cleanedComplaint = state.complaint;
        if (fieldBeingAsked.includes('event.date') || lastAgentMessage.toLowerCase().includes('date')) {
          cleanedComplaint = { ...state.complaint } as any;
          if (cleanedComplaint.event && cleanedComplaint.event.date !== undefined) {
            const { date, ...rest } = cleanedComplaint.event;
            cleanedComplaint.event = { ...rest };
          }
        }
        
          // Only provide guidance on first attempt; on second attempt, we'll skip the field
          if (currentAttempts === 1) {
            let guidance = '';
          
            if (fieldBeingAsked.includes('people.role') || fieldBeingAsked.includes('people.name')) {
              guidance = "If you don't know their name, you can describe them (like 'nurse at registration') or just say 'nurse' or 'doctor'. If you really don't know, just say 'unsure'.";
            } else if (fieldBeingAsked.includes('date') || fieldBeingAsked.includes('time')) {
              guidance = "An approximate time is fine (like 'yesterday afternoon' or 'last week'). If you can't remember, just say 'unsure'.";
            } else if (fieldBeingAsked.includes('location')) {
              guidance = "You can describe it generally (like 'emergency room' or 'ward 5'). If you're not sure, just say 'unsure'.";
            } else {
              guidance = "If you're not sure or don't have this information, just say 'unsure' or 'don't know'.";
            }
          
            return {
              needsMoreInfo: true,
              currentQuestion: validation.clarificationQuestion,
              messages: [...state.messages, new AIMessage(validation.clarificationQuestion), new AIMessage(guidance)],
              complaint: cleanedComplaint,
            };
          }
        
        return {
          needsMoreInfo: true,
          currentQuestion: validation.clarificationQuestion, // Keep same field, ask clarification
            messages: [...state.messages, new AIMessage(validation.clarificationQuestion)],
            complaint: cleanedComplaint,
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

  // If the current question is a confirmation, handle yes/no succinctly
  const confirmQuestionPattern = /(just to confirm|is this (?:correct|accurate)|please confirm|does this look right|is that (?:correct|accurate))/i;
  const affirmativePattern = /^(yes|yup|yeah|ya|y|correct|that's right|thats right|exactly|affirmative|sure|ok|okay)$/i;
  const negativePattern = /^(no|nope|nah|n|not really|incorrect|that's wrong|thats wrong|not correct)$/i;
  if (currentQuestion && confirmQuestionPattern.test(currentQuestion)) {
    const trimmed = userReply.trim().toLowerCase();
    if (affirmativePattern.test(trimmed)) {
      console.log(`[updateComplaint] Confirmation acknowledged (affirmative)`);
      // No changes needed; proceed without overwriting collected values
      return {};
    }
    if (negativePattern.test(trimmed)) {
      const followUp = `Thanks for letting me know. Could you share the correct ${fieldToUpdate.includes('event.date') ? 'date' : 'details'}?`;
      console.log(`[updateComplaint] Confirmation negative; asking for correction`);
      return {
        needsMoreInfo: true,
        currentQuestion: followUp,
        messages: [...state.messages, new AIMessage(followUp)],
      };
    }
  }

  // OPTIMIZATION: Handle numbered selections for typeOfCare dropdown
  let processedReply = userReply;
  if (fieldToUpdate === "typeOfCare") {
    const mapped = mapTypeOfCareInputToValue(userReply);
    if (mapped) {
      processedReply = mapped;
      console.log(`[updateComplaint] Normalized typeOfCare to: ${processedReply}`);
    }
  }
  
  // NEW: Handle numbered selections for impact dropdown
  if (fieldToUpdate === "impact") {
    console.log(`[updateComplaint] Processing impact field, raw input: "${userReply}"`);
    const mapped = mapImpactInputToValue(userReply);
    if (mapped) {
      processedReply = mapped;
      console.log(`[updateComplaint] ✓ Normalized impact to: ${processedReply}`);
    } else {
      console.log(`[updateComplaint] ✗ No mapping found, will pass raw input to LLM`);
    }
  }
  
  // NEW: Handle boolean fields for contact details
  if (fieldToUpdate === "contactDetails.isPatient" || fieldToUpdate === "contactDetails.wantsContact") {
    const yesPattern = /^(yes|yup|yeah|ya|y|true|i am|i'm the patient|me|myself)$/i;
    const noPattern = /^(no|nope|nah|n|false|not me|someone else|on behalf)$/i;
    const trimmed = userReply.trim().toLowerCase();
    
    if (yesPattern.test(trimmed)) {
      processedReply = "true";
      console.log(`[updateComplaint] Normalized boolean to: true`);
    } else if (noPattern.test(trimmed)) {
      processedReply = "false";
      console.log(`[updateComplaint] Normalized boolean to: false`);
    }
  }
  
  // NEW: Handle bundled contact details response (when user provides multiple fields at once)
  const contactFields = ['contactDetails.name', 'contactDetails.email', 'contactDetails.contactNo', 'contactDetails.isPatient', 'contactDetails.wantsContact'];
  if (contactFields.includes(fieldToUpdate)) {
    // Try to extract all contact fields from the response
    const extractMultiplePrompt = `Extract contact information from this user response. Extract whatever is available.

User response: "${userReply}"

Extract these fields (mark as null if not found):
- name: Full name
- email: Email address
- contactNo: Phone number
- isPatient: Are they the patient? (true/false, null if not mentioned)
- wantsContact: Do they want to be contacted? (true/false, null if not mentioned)

Respond ONLY with JSON:
{
  "name": "...",
  "email": "...",
  "contactNo": "...",
  "isPatient": true/false/null,
  "wantsContact": true/false/null
}`;

    try {
      const multiResponse = await llm.invoke(extractMultiplePrompt);
      const multiContent = multiResponse.content.toString().trim();
      const jsonMatch = multiContent.match(/\{[\s\S]*?\}/);
      
      if (jsonMatch) {
        const extracted = JSON.parse(jsonMatch[0]);
        console.log(`[updateComplaint] Extracted multiple contact fields:`, extracted);
        
        // Update all available contact fields
        const updatedComplaint = { ...complaint };
        if (!updatedComplaint.contactDetails) {
          updatedComplaint.contactDetails = {};
        }
        
        if (extracted.name && extracted.name !== "null") {
          updatedComplaint.contactDetails.name = extracted.name;
        }
        if (extracted.email && extracted.email !== "null") {
          updatedComplaint.contactDetails.email = extracted.email;
        }
        if (extracted.contactNo && extracted.contactNo !== "null") {
          updatedComplaint.contactDetails.contactNo = extracted.contactNo;
        }
        if (extracted.isPatient !== null && extracted.isPatient !== "null") {
          updatedComplaint.contactDetails.isPatient = extracted.isPatient;
        }
        if (extracted.wantsContact !== null && extracted.wantsContact !== "null") {
          updatedComplaint.contactDetails.wantsContact = extracted.wantsContact;
        }
        
        // Remove all collected contact fields from missingFields
        const remainingFields = missingFields.filter(f => {
          if (f === 'contactDetails.name' && extracted.name && extracted.name !== "null") return false;
          if (f === 'contactDetails.email' && extracted.email && extracted.email !== "null") return false;
          if (f === 'contactDetails.contactNo' && extracted.contactNo && extracted.contactNo !== "null") return false;
          if (f === 'contactDetails.isPatient' && extracted.isPatient !== null && extracted.isPatient !== "null") return false;
          if (f === 'contactDetails.wantsContact' && extracted.wantsContact !== null && extracted.wantsContact !== "null") return false;
          return true;
        });
        
        console.log(`[updateComplaint] Multiple contact fields collected, remaining: [${remainingFields.join(', ')}]`);
        
        const fieldAttempts = state.fieldAttempts || {};
        const resetAttempts = { ...fieldAttempts };
        // Reset attempts for all collected fields
        contactFields.forEach(f => delete resetAttempts[f]);
        
        return {
          complaint: updatedComplaint,
          missingFields: remainingFields,
          fieldAttempts: resetAttempts,
        };
      }
    } catch (error) {
      console.warn(`[updateComplaint] Failed to extract multiple contact fields, falling back to single field extraction:`, error);
    }
  }

  const extractPrompt = `You are extracting structured information from a user's response.

Question asked: "${currentQuestion}"
Field to extract: ${fieldToUpdate}
User's response: "${processedReply}"

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
    if (topLevel === 'impact') {
      (updatedComplaint as any)[topLevel] = extractedValue !== "UNKNOWN" ? [extractedValue] : undefined;
    } else {
      (updatedComplaint as any)[topLevel] = extractedValue !== "UNKNOWN" ? extractedValue : undefined;
    }
  }

  // Remove the field we just collected from missingFields
  const updatedMissingFields = missingFields.slice(1);
  console.log(`[updateComplaint] Field collected, remaining: [${updatedMissingFields.join(', ')}]`);
  
    const fieldAttempts = state.fieldAttempts || {};
    const resetAttempts = { ...fieldAttempts };
    delete resetAttempts[fieldToUpdate]; // Reset counter for this field since we collected it
  
  return {
    complaint: updatedComplaint,
    missingFields: updatedMissingFields,
      fieldAttempts: resetAttempts,
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
