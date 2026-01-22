import { AzureChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { GraphState } from "./graphState.js";
import { ComplaintDomain, ComplaintSubcategory } from "../config/complaintSchema.js";
import { HOSPITAL_CONFIG } from "../config/hospitalContext.js";
import { FIELD_DEFINITIONS, setUnknownValue, getFieldDefinition } from "../config/fieldConfig.js";
import { determineUserIntent, isAffirmative, isNegative, isClarificationRequest, isSkip } from "../config/userIntentPatterns.js";
import { mapInputToCanonical, getOptionsList, TYPE_OF_CARE_MAPPINGS, IMPACT_MAPPINGS, INSURANCE_STATUS_MAPPINGS } from "../config/fieldValueMappings.js";
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

// Type-of-care options generated from config (dynamic, not hardcoded)
function renderTypeOfCareOptionsText(): string {
  return getOptionsList(TYPE_OF_CARE_MAPPINGS, true);
}

/**
 * Generate context-aware questions based on complaint category
 */
function getContextualQuestions(subcategory: string | undefined, complaint: any): string[] {
  const questions: string[] = [];
  
  switch(subcategory) {
    case 'FACILITIES':
      // For facilities complaints (noise, cleanliness, comfort, navigation, equipment, etc.)
      questions.push('Which area or part of the hospital? (e.g., ward, room, waiting area)');
      questions.push('What specifically was the issue? (e.g., noise, cleanliness, temperature, comfort, equipment)');
      questions.push('How did this affect your stay? (e.g., disrupted sleep, discomfort, health concern)');
      break;
      
    case 'WAIT_TIME':
      // For wait time complaints
      questions.push('When did this happen? (date or "yesterday", "last week", etc.)');
      questions.push('Which service were you waiting for?');
      questions.push('How long did you wait?');
      break;
      
    case 'BILLING':
      // For billing complaints - vary questions based on issue type
      const desc = (complaint.description || '').toLowerCase();
      const adminErrorKeywords = ['name', 'address', 'wrong details', 'details wrong', 'incorrect name', 'incorrect address', 'wasn\'t checked', 'not checked', 'didn\'t check', 'didnt check', 'error', 'mistake', 'incorrect info', 'wrong info'];
      const chargeKeywords = ['charged', 'charge', 'overcharged', 'amount', 'cost', 'expensive', 'too much', 'extra', 'double', 'unexpected charge', 'wrong amount'];
      const isAdminError = adminErrorKeywords.some(keyword => desc.includes(keyword));
      const isChargeIssue = chargeKeywords.some(keyword => desc.includes(keyword));
      
      if (isAdminError && !isChargeIssue) {
        // Admin error (name, address, not checked) - don't ask about amount/insurance
        questions.push('How did this error affect you?');
      } else if (isChargeIssue) {
        // Charge/amount issue - ask about amount and insurance
        questions.push('What was the issue with the charge? (e.g., unexpected charge, wrong amount, unclear fees)');
        questions.push('Approximate amount involved?');
        questions.push('Do you have insurance that should have covered this?');
      } else {
        // Generic billing issue - start with understanding what type
        questions.push('What was the issue with your bill?');
        questions.push('How did this affect you?');
      }
      break;
      
    case 'APPOINTMENT':
      // For appointment-related complaints
      questions.push('What happened with your appointment? (e.g., cancelled, rescheduled, missed slot)');
      questions.push('When was this scheduled for?');
      questions.push('How did this affect you?');
      break;
      
    case 'ADMIN_PROCESS':
      // For administrative process complaints
      questions.push('Which process or step had an issue? (e.g., registration, paperwork, scheduling)');
      questions.push('When did this happen?');
      questions.push('What went wrong or could be improved?');
      break;
      
    case 'MEDICATION':
      // For medication-related complaints
      questions.push('Which medication was involved?');
      questions.push('When did this happen?');
      questions.push('What was the issue? (e.g., wrong medication, side effects, dosage unclear)');
      break;
      
    case 'DIAGNOSIS':
      // For diagnosis-related complaints
      questions.push('When did this happen?');
      questions.push('What was the concern about the diagnosis?');
      questions.push('How has this affected you?');
      break;
      
    case 'PROCEDURE':
      // For procedure-related complaints
      questions.push('Which procedure or treatment was involved?');
      questions.push('When did this happen?');
      questions.push('What was your concern?');
      break;
      
    case 'SAFETY':
      // For safety concerns - these are high priority
      questions.push('When did this safety concern occur?');
      questions.push('What exactly happened? (as much detail as you can provide)');
      questions.push('Who was involved or witnessed this?');
      break;
      
    case 'FOLLOW_UP':
      // For follow-up care issues
      questions.push('What follow-up care was supposed to happen?');
      questions.push('When was it supposed to happen?');
      questions.push('How has the lack of follow-up affected you?');
      break;
      
    case 'COMMUNICATION':
      // For communication/relationship complaints (avoid re-asking the core issue)
      questions.push('Who did you interact with? (role, name if known)');
      questions.push('When did this happen?');
      questions.push('How often has this happened? (one time or multiple times?)');
      break;
      
    case 'ATTITUDE':
      // For attitude complaints (avoid re-asking the core issue)
      questions.push('Who did you interact with? (role, name if known)');
      questions.push('When did this happen?');
      questions.push('In which department or area did this happen?');
      break;
      
    case 'RESPECT':
      // For respect/dignity complaints (avoid re-asking the core issue)
      questions.push('Who was involved? (role, name if known)');
      questions.push('When did this happen?');
      questions.push('Were there any witnesses to this?');
      break;
      
    case 'PROFESSIONALISM':
      // For professionalism complaints (avoid re-asking the core issue)
      questions.push('Who was involved? (role, name if known)');
      questions.push('When did this happen?');
      questions.push('Which department or area was this in?');
      break;
      
    default:
      // Generic fallback
      questions.push('When did this happen?');
      questions.push('Which department or service was involved?');
      questions.push('How did this affect you?');
  }
  
  return questions;
}

/**
 * Get context-aware empathy prefix based on category
 */
function getContextualEmpathyPrefix(subcategory: string | undefined): string {
  switch(subcategory) {
    case 'SAFETY':
      return "We take safety concerns very seriously.";
    case 'FACILITIES':
      return "Thank you for this feedback about our facilities.";
    case 'BILLING':
      return "I understand billing issues can be frustrating.";
    case 'WAIT_TIME':
      return "We apologize for the long wait time.";
    default:
      return "I'm sorry to hear about this.";
  }
}

/**
 * Irrelevant fields by category - these should never be asked for
 * This ensures we don't ask questions that don't match the complaint type
 */
function getIrrelevantFields(subcategory: string | undefined): string[] {
  switch(subcategory) {
    case 'FACILITIES':
      // Facilities complaints don't need department info, staff role, or medication
      return ['typeOfCare', 'people.role', 'medication.name', 'billing.amount', 'billing.insuranceStatus'];
    case 'WAIT_TIME':
      // Wait time complaints don't need staff role, medication, or billing
      return ['people.role', 'medication.name', 'billing.amount', 'billing.insuranceStatus'];
    case 'APPOINTMENT':
      // Appointment issues don't need department, staff, medication, or billing
      return ['typeOfCare', 'people.role', 'medication.name', 'billing.amount', 'billing.insuranceStatus'];
    case 'BILLING':
      // Billing complaints might need department but not medication unless specifically mentioned
      return ['medication.name', 'people.role'];
    case 'MEDICATION':
      // Medication complaints don't need billing or wait time info
      return ['billing.amount', 'billing.insuranceStatus', 'typeOfCare'];
    case 'DIAGNOSIS':
    case 'PROCEDURE':
    case 'FOLLOW_UP':
    case 'SAFETY':
      // Clinical complaints don't need billing or wait time
      return ['billing.amount', 'billing.insuranceStatus'];
    case 'COMMUNICATION':
    case 'ATTITUDE':
    case 'RESPECT':
    case 'PROFESSIONALISM':
      // Relationship complaints don't need medication or billing
      return ['medication.name', 'billing.amount', 'billing.insuranceStatus', 'typeOfCare'];
    default:
      return [];
  }
}

/**
 * Smart contextual filter for BILLING complaints
 * Analyzes complaint description to determine if billing amount/insurance are actually relevant
 * Example: "name on bill was wrong" → don't ask for amount/insurance
 * Example: "overcharged $500" → do ask for amount/insurance details
 */
function filterBillingFields(fieldsToProcess: string[], description: string | undefined): string[] {
  if (!description || !fieldsToProcess.includes('billing.amount')) {
    return fieldsToProcess;
  }

  const desc = description.toLowerCase();
  
  // Keywords indicating ADMINISTRATIVE ERROR (not amount/charge issue)
  const adminErrorKeywords = ['name', 'address', 'wrong details', 'details wrong', 'incorrect name', 'incorrect address', 'wasn\'t checked', 'not checked', 'didn\'t check', 'didnt check', 'staff didn\'t', 'error', 'mistake', 'incorrect info', 'wrong info'];
  const isAdminError = adminErrorKeywords.some(keyword => desc.includes(keyword));

  // Keywords indicating AMOUNT/CHARGE issue
  const chargeKeywords = ['charged', 'charge', 'overcharged', 'amount', 'cost', 'expensive', 'too much', 'extra', 'double', 'unexpected charge', 'wrong amount'];
  const isChargeIssue = chargeKeywords.some(keyword => desc.includes(keyword));

  // If it's an admin error (name, address, not checked), remove billing amount/insurance questions
  if (isAdminError && !isChargeIssue) {
    console.log(`[filterBillingFields] Detected ADMIN ERROR (not charge issue) → removing billing.amount, billing.insuranceStatus`);
    return fieldsToProcess.filter((f: string) => !f.includes('billing.amount') && !f.includes('billing.insuranceStatus'));
  }

  return fieldsToProcess;
}

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
// Now uses data-driven config instead of hardcoded if-else
function mapTypeOfCareInputToValue(input: string): string | null {
  return mapInputToCanonical(input, TYPE_OF_CARE_MAPPINGS, true);
}

// Map free text or numeric selection to a canonical impact value
// Now uses data-driven config instead of hardcoded if-else
function mapImpactInputToValue(input: string): string | null {
  return mapInputToCanonical(input, IMPACT_MAPPINGS, true);
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

  // Filter out fields that are set to 'unknown' (user skipped them)
  const knownInfo = Object.entries(currentInfo)
    .filter(([_, value]) => value !== undefined && (value as any) !== 'unknown' && (!Array.isArray(value) || (Array.isArray(value) && (value[0] as any) !== 'unknown')))
    .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});

  // Remove undefined values (use knownInfo which excludes 'unknown' values)
  const knownFields = Object.entries(knownInfo)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ');

  const determinePrompt = `You are a hospital complaint intake specialist. Analyze what information we have and determine what ADDITIONAL information would be genuinely useful for properly handling this complaint.

Complaint Type: ${complaint.subcategory} (${complaint.domain})
User's Complaint Description: "${complaint.description}"
Information Already Collected:
${knownFields || 'Only basic complaint classification'}

**CONTEXT-AWARE FIELD SELECTION RULES:**

For FACILITIES complaints (wayfinding, noise, cleanliness, comfort, equipment):
- DO collect: event.location (area/ward), impact (how it affected them)
- DO NOT collect: typeOfCare (not relevant for facility feedback), people.role
- Example: "Toilet hard to find" → only ask for location, not department/service

For WAIT_TIME complaints:
- DO collect: event.date, typeOfCare (which service), impact if severe
- DO NOT collect: people.role, billing

For BILLING complaints - ANALYZE THE SPECIFIC ISSUE:
- If about WRONG AMOUNT/OVERCHARGE → collect: event.date, typeOfCare, billing.amount, insuranceStatus
- If about NAME/ADDRESS/ERROR on bill → collect: event.date, impact (only)
- If about staff not checking/verifying → collect: people.role (who didn't check?), event.date, impact
- DO NOT collect: fields not directly related to the specific billing issue

**CRITICAL - What NOT to Ask (even if category seems to match):**
- DON'T ask "Do you have insurance?" for billing complaints about WRONG NAME/WRONG DETAILS on bill
- DON'T ask "How much was charged?" for billing complaints about staff not verifying/checking
- DON'T ask "Which department?" for facility complaints about physical environment
- DON'T ask "What service?" if user already described the location/area
- DON'T repeat asking for details user has already provided in description
- DON'T ask unrelated fields just because they're in the category checklist

For APPOINTMENT complaints:
- DO collect: event.date
- DO NOT collect: typeOfCare, people.role

For MEDICATION/CLINICAL complaints:
- DO collect: event.date, medication.name, impact
- DO NOT collect: typeOfCare unless truly relevant

For ATTITUDE/COMMUNICATION/PROFESSIONALISM complaints:
- DO collect: people.role (staff involved), event.date
- DO NOT collect: typeOfCare, billing, medication

For SAFETY complaints:
- DO collect: event.date, impact (high priority), people.role if known
- DO NOT collect: typeOfCare

**CONTACT DETAILS (REQUIRED FOR FOLLOW-UP)**: ALWAYS collect:
- contactDetails.wantsContact FIRST - Do they want to be contacted? (required - true/false)
- Only ask for name/email/phone/isPatient if wantsContact=true

**GENERAL RULES:**
- Be SMART and CONTEXT-AWARE - analyze the SPECIFIC complaint, not just the category
- Avoid asking for non-essential fields
- If user has already explained the core issue in detail, DON'T ask for more of the same
- If user hasn't mentioned IMPACT (how it affected them), prioritize asking about IMPACT
- Examples:
  * User says "bill name was wrong" → Ask: "How did this affect you?" | DON'T ask: "how much?" or "insurance?"
  * User says "waited 5 hours" → Ask: "How did that affect you?" | DON'T ask: "do you have insurance?"
  * User says "staff didn't check" → Ask: "How did this impact you?" | DON'T ask: unrelated fields
- When in doubt: ask fewer questions, prioritize impact, then move to contact details


Respond with JSON array of fields STILL NEEDED. Use these field names ONLY:
[
  "event.date",
  "typeOfCare",
  "billing.amount",
  "billing.insuranceStatus",
  "medication.name",
  "people.role",
  "impact",
  "contactDetails.wantsContact",
  "contactDetails.isPatient",
  "contactDetails.name",
  "contactDetails.email",
  "contactDetails.contactNo",
]

Only include fields that are needed. Omit fields not mentioned.`;

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

    // FILTER 1: Remove irrelevant fields based on complaint category (static rules)
    const irrelevantFields = getIrrelevantFields(complaint.subcategory);
    let fieldsToProcess = Array.isArray(missingFields) ? missingFields.filter((f: string) => !irrelevantFields.includes(f)) : [];
    
    console.log(`[determineMissingFields] LLM returned: [${Array.isArray(missingFields) ? missingFields.join(', ') : 'none'}]`);
    console.log(`[determineMissingFields] Filtered irrelevant (${irrelevantFields.join(', ')}): [${fieldsToProcess.join(', ')}]`);

    // FILTER 1B: For BILLING complaints, apply smart contextual filtering
    if (complaint.subcategory === 'BILLING') {
      fieldsToProcess = filterBillingFields(fieldsToProcess, complaint.description);
      console.log(`[determineMissingFields] After billing context filter: [${fieldsToProcess.join(', ')}]`);
    }

    // FILTER 2: Handle contact fields based on user preference
    const wantsContact = (complaint.contactDetails?.wantsContact as any) === true || (complaint.contactDetails?.wantsContact as any) === 'true';
    
    if (!wantsContact) {
      // User doesn't want contact - remove all contact detail fields except wantsContact
      fieldsToProcess = fieldsToProcess.filter((f: string) => !f.startsWith('contactDetails.') || f === 'contactDetails.wantsContact');
      console.log(`[determineMissingFields] User doesn't want contact - filtered contact fields`);
    } else if (wantsContact && !complaint.contactDetails?.wantsContact) {
      // This shouldn't happen, but just in case
      console.log(`[determineMissingFields] wantsContact is true but not set in complaint`);
    } else if (wantsContact && complaint.contactDetails?.wantsContact) {
      // User WANTS contact - ensure we ask for contact details if they're in missingFields
      // Don't filter them out; let them be asked
      console.log(`[determineMissingFields] User wants contact - keeping contact detail fields`);
    }

    // SAFEGUARD: If we have no fields and haven't asked about contact yet, add wantsContact
    if (fieldsToProcess.length === 0 && !complaint.contactDetails?.wantsContact) {
      console.log(`[determineMissingFields] No fields to ask - adding wantsContact`);
      fieldsToProcess.push('contactDetails.wantsContact');
    }

    // ENHANCEMENT: If user said yes to contact, make sure we ask for their contact details
    // by adding them to the fields if they're missing
    if (wantsContact && complaint.contactDetails?.wantsContact === true) {
      const contactFieldsNeeded = [];
      if (!complaint.contactDetails?.name) contactFieldsNeeded.push('contactDetails.name');
      if (!complaint.contactDetails?.email) contactFieldsNeeded.push('contactDetails.email');
      if (!complaint.contactDetails?.contactNo) contactFieldsNeeded.push('contactDetails.contactNo');
      if (complaint.contactDetails?.isPatient === undefined || complaint.contactDetails?.isPatient === null) {
        contactFieldsNeeded.push('contactDetails.isPatient');
      }
      
      // Add any missing contact fields that aren't already in fieldsToProcess
      for (const field of contactFieldsNeeded) {
        if (!fieldsToProcess.includes(field)) {
          fieldsToProcess.push(field);
          console.log(`[determineMissingFields] Added contact field to ask: ${field}`);
        }
      }
    }

    console.log(`[determineMissingFields] Final fieldsToProcess: [${fieldsToProcess.join(', ')}]`);

    // Generic filter: Never re-ask fields that have been attempted or already have values
    const fieldAttempts = state.fieldAttempts || {};
    const filteredFields = Array.isArray(fieldsToProcess) ? fieldsToProcess.filter((f: string) => {
      // Rule 1: If we've already attempted this field, don't ask again (field has been asked before)
      if (fieldAttempts[f] && fieldAttempts[f] > 0) {
        console.log(`[determineMissingFields] Filtering out ${f} - already attempted ${fieldAttempts[f]} time(s)`);
        return false;
      }

      // Rule 2: Check if field already has a non-empty, non-'unknown' value in complaint
      const hasValue = (fieldPath: string): boolean => {
        const [top, sub] = fieldPath.split('.');
        const obj = (complaint as any)[top as any];
        if (!obj) return false;
        if (sub) {
          const val = obj[sub];
          return val !== undefined && val !== null && (val as any) !== 'unknown' && 
                 !(Array.isArray(val) && (val[0] as any) === 'unknown');
        } else {
          const val = obj;
          return val !== undefined && val !== null && (val as any) !== 'unknown' && 
                 !(Array.isArray(val) && (val[0] as any) === 'unknown');
        }
      };

      if (hasValue(f)) {
        console.log(`[determineMissingFields] Filtering out ${f} - already has value in complaint`);
        return false;
      }

      return true;
    }) : [];

    const contactPrefixes = ['contactDetails.'];
    const isContactField = (f: string) => contactPrefixes.some(prefix => f.startsWith(prefix));
    const reordered = [...filteredFields.filter((f: string) => !isContactField(f)), ...filteredFields.filter((f: string) => isContactField(f))];
    
    // SAFEGUARD: Remove contactDetails.address (removed from schema)
    const finalFields = reordered.filter((f: string) => f !== 'contactDetails.address');
    
    console.log(`[determineMissingFields] LLM requested fields (filtered & ordered): [${finalFields.join(', ')}]`);
    console.log(`[determineMissingFields] RETURNING missingFields with length: ${finalFields.length}`);
    
    return { missingFields: finalFields };
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

  const situationMissing = missingFields.filter((f: string) => !f.startsWith('contactDetails.'));
  const contactMissing = missingFields.filter((f: string) => f.startsWith('contactDetails.'));

  // Prioritize a situation field (non-contact) for the next question when available
  const fieldToAsk = (situationMissing.length > 0) ? situationMissing[0] : missingFields[0];
  if (!fieldToAsk) {
    return {};
  }

  // Reorder missingFields so the field we're asking is first (so skips remove the right one)
  const orderedMissingFields = [fieldToAsk, ...missingFields.filter((f: string, idx: number) => !(f === fieldToAsk && idx === missingFields.indexOf(fieldToAsk)) )];
  
  const fieldAttempts: Record<string, number> = state.fieldAttempts || {};
  const currentAttempts = fieldAttempts[fieldToAsk] || 0;
  
  const remainingAfterThis = orderedMissingFields.filter((f: string, idx: number) => !(f === fieldToAsk && idx === orderedMissingFields.indexOf(fieldToAsk)));
  console.log(`[askClarifyingQuestion] Asking for field: "${fieldToAsk}" (attempt ${currentAttempts + 1}), remaining: [${remainingAfterThis.join(', ')}]`);
  
  // If we've already asked twice and they still can't answer, skip this field
  if (currentAttempts >= 2) {
    console.log(`[askClarifyingQuestion] Field "${fieldToAsk}" attempted ${currentAttempts} times, SKIPPING`);
    const updatedAttempts: Record<string, number> = { ...fieldAttempts };
    updatedAttempts[fieldToAsk] = 0;
    const remainingFields = orderedMissingFields.filter((f: string, idx: number) => !(f === fieldToAsk && idx === orderedMissingFields.indexOf(fieldToAsk)));
    return {
      missingFields: remainingFields, // Remove this field and move on
      fieldAttempts: updatedAttempts, // Reset counter
    };
  }

  // Check if this is the first question (no attempts yet on any field) - use bundled empathetic approach
  const isFirstQuestion = Object.keys(fieldAttempts).length === 0 || Object.values(fieldAttempts).every(v => v === 0);
  
  if (isFirstQuestion && situationMissing.length >= 1) {
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
    
    const empathyPrefix = getContextualEmpathyPrefix(complaint.subcategory);
    
    // Get contextual questions based on complaint category
    const contextualQuestions = getContextualQuestions(complaint.subcategory, complaint);
    const irrelevantFields = getIrrelevantFields(complaint.subcategory);
    
    // Filter contextual questions to only show relevant ones based on missing fields
    // Map common contextual question patterns to fields they ask for
    const questionFieldMap: Record<string, string[]> = {
      'Which area': ['event.location'],
      'When did': ['event.date'],
      'How did this': ['impact'],
      'Which medication': ['medication.name'],
      'Who was': ['people.role'],
      'What service': ['typeOfCare'],
      'What was': ['impact', 'people.role'],
      'Which department': ['typeOfCare'],
    };
    
    // Filter to only show questions for fields that are actually in missingFields
    const relevantContextualQuestions = contextualQuestions.filter((q: string) => {
      // Check if any key in the question matches a field we're actually asking for
      const isRelevant = Object.entries(questionFieldMap).some(([key, fields]) => {
        if (q.includes(key)) {
          return fields.some(f => orderedMissingFields.includes(f) || situationMissing.includes(f));
        }
        return false;
      });
      
      // If it doesn't match the map, include it (be permissive for edge cases)
      if (!isRelevant && Object.keys(questionFieldMap).every(key => !q.includes(key))) {
        return true;
      }
      
      return isRelevant;
    });
    
    // Show up to 3 relevant questions
    const bulletPoints = relevantContextualQuestions
      .slice(0, 3)
      .map((q: string) => `• ${q}`)
      .join('\n');
    
    const question = `${empathyPrefix} To help us investigate and provide feedback, could you share:\n\n${bulletPoints}\n\nShare what you remember - approximate details are fine. If you don't know, just say "don't know" and we'll move on.`;
    
    const updatedMessages = [...state.messages, new AIMessage(question)];
    const updatedAttempts: Record<string, number> = { ...fieldAttempts };
    updatedAttempts[fieldToAsk] = currentAttempts + 1;
    
    return {
      currentQuestion: question,
      messages: updatedMessages,
      fieldAttempts: updatedAttempts,
      missingFields: orderedMissingFields,
    };
  }

  // OPTIMIZATION: For typeOfCare, provide dropdown-style options instead of open-ended question
  if (fieldToAsk === "typeOfCare") {
    const question = `To route your concern to the right department, could you tell me which service or department this was related to?\n\n${renderTypeOfCareOptionsText()}\n\nIf you don't know, just say "don't know" and we'll move on.`;
    
    const updatedMessages = [...state.messages, new AIMessage(question)];
    const updatedAttempts: Record<string, number> = { ...fieldAttempts };
    updatedAttempts[fieldToAsk] = currentAttempts + 1;
    
    return {
      currentQuestion: question,
      messages: updatedMessages,
      fieldAttempts: updatedAttempts,
      missingFields: orderedMissingFields,
    };
  }
  
  // NEW: For impact, ask conversational question with contextual concerns
  if (fieldToAsk === "impact") {
    let contextualConcerns = "like stress, delays in care, or affecting your daily activities";
    
    // Tailor concerns based on complaint type
    if (complaint.subcategory === 'WAIT_TIME') {
      contextualConcerns = "like extra stress, time lost, or affecting your plans";
    } else if (complaint.subcategory === 'BILLING') {
      contextualConcerns = "like financial strain, stress, or affecting your other medical care";
    } else if (complaint.subcategory === 'MEDICATION') {
      contextualConcerns = "like health impacts, side effects, or worry about your treatment";
    } else if (complaint.subcategory === 'FACILITIES') {
      contextualConcerns = "like discomfort, sleep disruption, or affecting your recovery";
    }
    
    const question = `How did this affect you? (for example, ${contextualConcerns})`;
    const updatedMessages = [...state.messages, new AIMessage(question)];
    const updatedAttempts: Record<string, number> = { ...fieldAttempts };
    updatedAttempts[fieldToAsk] = currentAttempts + 1;
    
    return {
      currentQuestion: question,
      messages: updatedMessages,
      fieldAttempts: updatedAttempts,
      missingFields: orderedMissingFields,
    };
  }
  
  // Handle contact detail fields - first ask if they want to be contacted (opt-in flow)
  const contactFields = ['contactDetails.name', 'contactDetails.email', 'contactDetails.contactNo', 'contactDetails.isPatient', 'contactDetails.wantsContact'];
  if (contactFields.includes(fieldToAsk)) {
    // If asking for wantsContact, do it FIRST before any other contact details
    if (fieldToAsk === 'contactDetails.wantsContact') {
      const question = `Thank you for sharing this information. Would you like us to contact you regarding this complaint? (Yes/No)`;
      
      const updatedMessages = [...state.messages, new AIMessage(question)];
      const updatedAttempts: Record<string, number> = { ...fieldAttempts };
      updatedAttempts[fieldToAsk] = currentAttempts + 1;
      
      return {
        currentQuestion: question,
        messages: updatedMessages,
        fieldAttempts: updatedAttempts,
        missingFields: orderedMissingFields,
      };
    }
    
    // Only ask for other contact details if user wants to be contacted
    const wantsContact = (complaint.contactDetails?.wantsContact as any) === true || (complaint.contactDetails?.wantsContact as any) === 'true';
    if (!wantsContact && fieldToAsk !== 'contactDetails.wantsContact') {
      // User doesn't want contact - end conversation (no additional questions)
      return {};
    }
    
    // If asking for other contact details, ask them one by one or bundled
    const missingContactFields = missingFields.filter((f: string) => contactFields.includes(f));
    
    if (missingContactFields.length >= 2) {
      // Ask for main contact details (skip wantsContact as we already have it)
      const question = `Thank you. To help us follow up with you, could you please share your name, email address, contact number, and let me know if you're the patient?`;
      
      const updatedMessages = [...state.messages, new AIMessage(question)];
      const updatedAttempts: Record<string, number> = { ...fieldAttempts };
      updatedAttempts[fieldToAsk] = currentAttempts + 1;
      
      return {
        currentQuestion: question,
        messages: updatedMessages,
        fieldAttempts: updatedAttempts,
        missingFields: orderedMissingFields,
      };
    }
  }
  
  // Handle isPatient yes/no question
  if (fieldToAsk === "contactDetails.isPatient") {
    const question = `Are you the patient, or are you submitting this feedback on behalf of someone else? (Yes/No)`;
    const updatedMessages = [...state.messages, new AIMessage(question)];
    const updatedAttempts: Record<string, number> = { ...fieldAttempts };
    updatedAttempts[fieldToAsk] = currentAttempts + 1;
    
    return {
      currentQuestion: question,
      messages: updatedMessages,
      fieldAttempts: updatedAttempts,
      missingFields: orderedMissingFields,
    };
  }
  
  // Handle wantsContact yes/no question
  if (fieldToAsk === "contactDetails.wantsContact") {
    const question = `Thank you for sharing this information. Would you like us to contact you regarding this complaint? (Yes/No)`;
    const updatedMessages = [...state.messages, new AIMessage(question)];
    const updatedAttempts: Record<string, number> = { ...fieldAttempts };
    updatedAttempts[fieldToAsk] = currentAttempts + 1;
    
    return {
      currentQuestion: question,
      messages: updatedMessages,
      fieldAttempts: updatedAttempts,
      missingFields: orderedMissingFields,
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
  const question = `${response.content.toString().trim()} If you don't know, just say "don't know" and we'll move on.`;

  // Add assistant message to history
  const updatedMessages = [...state.messages, new AIMessage(question)];

  const updatedAttempts: Record<string, number> = { ...fieldAttempts };
  updatedAttempts[fieldToAsk] = currentAttempts + 1;
  
  return {
    currentQuestion: question,
    messages: updatedMessages,
    fieldAttempts: updatedAttempts,
    missingFields: orderedMissingFields,
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
  
  // Fast path: User is clearly asking for clarification
  if (isClarificationRequest(userResponse)) {
    const field = missingFields?.[0] || "";
    // Get explanation from config, fall back to generic if not found
    const fieldDef = field ? getFieldDefinition(field) : undefined;
    const explanation = fieldDef?.explanation || 
      `I understand you need clarification. If you're not sure how to answer or don't have this information, that's completely okay - just let me know and we can move on.`;

    console.log(`[interpretUserResponse] ${Date.now() - t0}ms - Fast path: CLARIFY detected`);
    return {
      messages: [...state.messages, new AIMessage(explanation)],
    };
  }
  
  // Fast path: User wants to skip
  if (isSkip(userResponse)) {
    const fieldToSkip = missingFields?.[0];
    const updatedMissingFields = fieldToSkip
      ? (state.missingFields || []).filter((f: string, idx: number) => !(f === fieldToSkip && idx === (state.missingFields || []).indexOf(fieldToSkip)))
      : (state.missingFields || []).slice(1) || [];

    const updatedComplaint = { ...state.complaint } as any;
    // Mark skipped fields as 'unknown' to prevent re-asking (data-driven approach)
    if (fieldToSkip) {
      const updated = setUnknownValue(updatedComplaint, fieldToSkip);
      Object.assign(updatedComplaint, updated);
    }

    const fieldAttempts = state.fieldAttempts || {};
    const resetAttempts = { ...fieldAttempts };
    // CRITICAL: Mark this field as "attempted" with a high number so determineMissingFields filters it out
    // (Don't delete - that would allow re-asking. Instead set to 999 to permanently exclude it)
    if (fieldToSkip) resetAttempts[fieldToSkip] = 999;

    console.log(`[interpretUserResponse] ${Date.now() - t0}ms - Fast path: SKIP detected for ${fieldToSkip || 'unknown field'}`);
    const ack = "No worries, we'll skip that and move on.";
    return {
      missingFields: updatedMissingFields,
      currentQuestion: undefined,
      complaint: updatedComplaint,
      fieldAttempts: resetAttempts,
      messages: [...state.messages, new AIMessage(ack)],
    };
  }

  // Fast path: Determine user intent from their response
  const userIntent = determineUserIntent(userResponse);
  if (userIntent === 'ANSWER') {
    console.log(`[interpretUserResponse] ${Date.now() - t0}ms - Fast path: ANSWER detected via intent analysis`);
    return {}; // Proceed to update (ANSWER)
  }

  // Fallback to LLM only for truly ambiguous cases
  const interpretPrompt = `You are analyzing a user's response to a question in a hospital complaint intake process.

Question Asked: "${currentQuestion}"
User's Response: "${userResponse}"

Determine the intent of the user's response:
- "ANSWER": User is providing an answer to the question
- "CLARIFY": User is asking what the question means or needs clarification
- "SKIP": User says "I don't know", "not applicable", "skip", etc.

Respond with ONLY ONE WORD: ANSWER, CLARIFY, or SKIP`;

  const response = await llm.invoke(interpretPrompt);
  const llmIntent = response.content.toString().trim().toUpperCase();

  if (llmIntent.includes("CLARIFY")) {
    return await provideFieldExplanation(missingFields?.[0] || "", state);
  }

  if (llmIntent.includes("SKIP")) {
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
    // User needs clarification - provide explanation from config
    const fieldDef = field ? getFieldDefinition(field) : undefined;
    const explanation = fieldDef?.explanation ||
      `I understand you need clarification. If you're not sure how to answer or don't have this information, that's completely okay - just let me know and we can move on.`;

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
    .filter((m: any) => m._getType?.() === 'human' || m.constructor.name === 'HumanMessage')
    .pop()
    ?.content?.toString() || "";
  
  const lastAgentMessage = messages
    .filter((m: any) => m._getType?.() === 'ai' || m.constructor.name === 'AIMessage')
    .pop()
    ?.content?.toString() || "";

  // Fast path: Handle simple yes/no confirmations to avoid re-asking the same question
  const confirmQuestionPattern = /(to confirm|is this (?:correct|accurate|the)|please confirm|does this look right|is that (?:correct|accurate|the)|is .* the (?:correct|exact|full)|if not,? please)/i;
  if (confirmQuestionPattern.test(lastAgentMessage)) {
    const trimmed = lastUserMessage.trim().toLowerCase();
    if (isAffirmative(trimmed)) {
      console.log(`[validateExtractedData] ${Date.now() - t0}ms - Fast confirm: affirmative, advancing to next field`);
      // Advance to next field by removing current field from missingFields
      const currentField = missingFields?.[0];
      if (currentField) {
        const updatedFields = missingFields.slice(1);
        const fieldAttempts = state.fieldAttempts || {};
        const resetAttempts = { ...fieldAttempts };
        delete resetAttempts[currentField];
        return {
          missingFields: updatedFields,
          fieldAttempts: resetAttempts,
        };
      }
      return {};
    }
    if (isNegative(trimmed)) {
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
  // IMPORTANT: Only apply date validation if we're specifically asking for a date field
  // NOT just if the message contains "when did" (to avoid validating duration as a date)
  const isAskingForDate = dateFields.some(f => fieldBeingAsked.includes(f));
  
  if (isAskingForDate) {
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

  // NEW: Skip strict LLM validation for contact detail fields (name, email, phone)
  // These fields are optional and user responses can vary widely
  const optionalContactFields = ['contactDetails.name', 'contactDetails.email', 'contactDetails.contactNo'];
  if (optionalContactFields.some(f => fieldBeingAsked.includes(f))) {
    console.log(`[validateExtracted] ${Date.now() - t0}ms - ✓ Optional contact field (${fieldBeingAsked}) detected, SKIPPING strict LLM validation`);
    return {};
  }

  // NEW: Handle Yes/No fields (wantsContact, isPatient) with simple affirmative/negative matching
  const yesNoFields = ['contactDetails.wantsContact', 'contactDetails.isPatient'];
  if (yesNoFields.some(f => fieldBeingAsked.includes(f))) {
    const trimmed = lastUserMessage.trim().toLowerCase();
    const fieldAttempts = state.fieldAttempts || {};
    const currentAttempts = fieldAttempts[fieldBeingAsked] || 0;

    // Check for clear yes/no answer
    if (isAffirmative(trimmed)) {
      console.log(`[validateExtracted] ${Date.now() - t0}ms - ✓ Yes/No field (${fieldBeingAsked}): AFFIRMATIVE detected`);
      return {};
    }
    
    if (isNegative(trimmed)) {
      console.log(`[validateExtracted] ${Date.now() - t0}ms - ✓ Yes/No field (${fieldBeingAsked}): NEGATIVE detected`);
      return {};
    }

    // If neither yes nor no, and this is the first attempt, ask for clarification
    if (currentAttempts === 0) {
      let clarification = '';
      if (fieldBeingAsked.includes('wantsContact')) {
        clarification = `Sorry, I didn't catch that. Would you like us to contact you about this complaint? Please say Yes or No.`;
      } else if (fieldBeingAsked.includes('isPatient')) {
        clarification = `Sorry, I didn't catch that. Are you the patient? Please say Yes or No.`;
      }
      console.log(`[validateExtracted] ${Date.now() - t0}ms - Yes/No field needs clarification (attempt 1)`);
      return {
        needsMoreInfo: true,
        currentQuestion: clarification,
        messages: [...state.messages, new AIMessage(clarification)],
        missingFields: [fieldBeingAsked],
      };
    }

    // Second attempt: if still no clear yes/no, assume they don't want to engage further
    if (currentAttempts >= 1) {
      // For wantsContact: default to false and move on
      if (fieldBeingAsked.includes('wantsContact')) {
        console.log(`[validateExtracted] ${Date.now() - t0}ms - No clear Yes/No for wantsContact after 2 attempts, defaulting to false`);
        const updatedComplaint = { ...state.complaint } as any;
        if (!updatedComplaint.contactDetails) {
          updatedComplaint.contactDetails = {};
        }
        updatedComplaint.contactDetails.wantsContact = false;
        
        return {
          complaint: updatedComplaint,
          missingFields: (state.missingFields || []).slice(1),
        };
      }
      
      // For isPatient: default to true (assume they are the patient) and move on
      if (fieldBeingAsked.includes('isPatient')) {
        console.log(`[validateExtracted] ${Date.now() - t0}ms - No clear Yes/No for isPatient after 2 attempts, defaulting to true`);
        const updatedComplaint = { ...state.complaint } as any;
        if (!updatedComplaint.contactDetails) {
          updatedComplaint.contactDetails = {};
        }
        updatedComplaint.contactDetails.isPatient = true;
        
        return {
          complaint: updatedComplaint,
          missingFields: (state.missingFields || []).slice(1),
        };
      }
    }
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

  // CRITICAL FIX: If user said they want to skip this field, don't extract - just remove it
  if (isSkip(userReply)) {
    console.log(`[updateComplaint] User said 'skip' for ${fieldToUpdate}, removing from missingFields`);
    const updatedMissingFields = missingFields.slice(1);
    const updatedComplaint = { ...complaint } as any;
    // Mark skipped fields as 'unknown' to prevent re-asking (consistent with setUnknownValue)
    const updated = setUnknownValue(updatedComplaint, fieldToUpdate);
    Object.assign(updatedComplaint, updated);
    
    const fieldAttempts = state.fieldAttempts || {};
    const resetAttempts = { ...fieldAttempts };
    // CRITICAL: Mark as "attempted 999 times" to permanently exclude from missingFields
    resetAttempts[fieldToUpdate] = 999;
    return {
      complaint: updatedComplaint,
      missingFields: updatedMissingFields,
      fieldAttempts: resetAttempts,
    };
  }

  // If the user answered a bundled question, try to capture multiple situation fields at once
  const situationFields = ["event.date", "typeOfCare", "impact", "people.role", "event.location", "medication.name"];
  const remainingSituation = missingFields.filter((f: string) => situationFields.includes(f));
  const looksBundled = (currentQuestion || "").includes("•") || (currentQuestion || "").includes("could you share");

  if (remainingSituation.length > 1 && looksBundled) {
    const multiPrompt = `Extract the following fields from the user's response. Return null for anything not clearly provided.

User response: "${userReply}"
Fields (JSON keys):
${remainingSituation.map(f => `- ${f}`).join('\n')}

Respond ONLY with JSON, e.g. {"event.date": "...", "typeOfCare": "...", "impact": "...", "people.role": "...", "event.location": "..."}`;

    try {
      const multi = await llm.invoke(multiPrompt);
      const multiContent = multi.content.toString().trim();
      const jsonMatch = multiContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const extracted = JSON.parse(jsonMatch[0]);
        const updatedComplaint: any = { ...complaint };
        const collected: string[] = [];

        if (remainingSituation.includes("event.date") && extracted["event.date"]) {
          updatedComplaint.event = { ...(complaint.event || {}), date: extracted["event.date"] };
          collected.push("event.date");
        }

        if (remainingSituation.includes("typeOfCare") && extracted["typeOfCare"]) {
          const mapped = mapTypeOfCareInputToValue(extracted["typeOfCare"]) || extracted["typeOfCare"]; // normalize if possible
          updatedComplaint.typeOfCare = mapped;
          collected.push("typeOfCare");
        }

        if (remainingSituation.includes("impact") && extracted["impact"]) {
          const mappedImpact = mapImpactInputToValue(extracted["impact"]) || extracted["impact"]; // normalize if possible
          updatedComplaint.impact = [mappedImpact];
          collected.push("impact");
        }

        if (remainingSituation.includes("people.role") && extracted["people.role"]) {
          updatedComplaint.people = { ...(complaint.people || {}), role: extracted["people.role"] };
          collected.push("people.role");
        }

        if (remainingSituation.includes("event.location") && extracted["event.location"]) {
          updatedComplaint.event = { ...(complaint.event || {}), location: extracted["event.location"] };
          collected.push("event.location");
        }

        if (remainingSituation.includes("medication.name") && extracted["medication.name"]) {
          updatedComplaint.medication = { ...(complaint.medication || {}), name: extracted["medication.name"] };
          collected.push("medication.name");
        }

        if (collected.length > 0) {
          const remaining = missingFields.filter((f: string) => !collected.includes(f));
          const fieldAttempts = state.fieldAttempts || {};
          const resetAttempts = { ...fieldAttempts };
          collected.forEach(f => delete resetAttempts[f]);
          console.log(`[updateComplaint] Multi-field capture from bundled reply; collected: ${collected.join(', ')}, remaining: [${remaining.join(', ')}]`);
          return {
            complaint: updatedComplaint,
            missingFields: remaining,
            fieldAttempts: resetAttempts,
          };
        }
      }
    } catch (err) {
      console.warn(`[updateComplaint] Multi-field extraction failed, continuing with single-field path`, err);
    }
  }

  // If the current question is a confirmation, handle yes/no succinctly
  const confirmQuestionPattern = /(to confirm|is this (?:correct|accurate|the)|please confirm|does this look right|is that (?:correct|accurate|the)|is .* the (?:correct|exact|full)|if not,? please)/i;
  const affirmativePattern = /^(yes|yup|yeah|ya|y|correct|that's right|thats right|exactly|affirmative|sure|ok|okay)$/i;
  const negativePattern = /^(no|nope|nah|n|not really|incorrect|that's wrong|thats wrong|not correct)$/i;
  if (currentQuestion && confirmQuestionPattern.test(currentQuestion)) {
    const trimmed = userReply.trim().toLowerCase();
    if (affirmativePattern.test(trimmed)) {
      console.log(`[updateComplaint] Confirmation acknowledged (affirmative) - advancing to next field`);
      // User confirmed, remove this field and move on
      const updatedMissingFields = missingFields.slice(1);
      const fieldAttempts = state.fieldAttempts || {};
      const resetAttempts = { ...fieldAttempts };
      delete resetAttempts[fieldToUpdate];
      return {
        missingFields: updatedMissingFields,
        fieldAttempts: resetAttempts,
      };
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

  // Handle "no one" or "can't remember" responses for people.role to avoid repeat asks
  if (fieldToUpdate === "people.role") {
    const nonePatterns = /(no one|nobody|none|didn't speak|did not speak|no staff|no person|nope|nil)/i;
    const unsurePatterns = /(don'?t remember|do not remember|can'?t remember|can'?t recall|not sure|unsure|don't know|do not know|idk)/i;
    if (nonePatterns.test(userReply)) {
      const updatedComplaint = { ...complaint, people: { ...(complaint.people || {}), role: "none" } };
      const updatedMissingFields = missingFields.slice(1);
      const fieldAttempts = state.fieldAttempts || {};
      const resetAttempts = { ...fieldAttempts };
      delete resetAttempts[fieldToUpdate];
      console.log(`[updateComplaint] Captured 'no one' for people.role; remaining fields: [${updatedMissingFields.join(', ')}]`);
      return {
        complaint: updatedComplaint,
        missingFields: updatedMissingFields,
        fieldAttempts: resetAttempts,
      };
    }
    if (unsurePatterns.test(userReply)) {
      const updatedComplaint = { ...complaint, people: { ...(complaint.people || {}), role: "unsure" } };
      const updatedMissingFields = missingFields.slice(1);
      const fieldAttempts = state.fieldAttempts || {};
      const resetAttempts = { ...fieldAttempts };
      delete resetAttempts[fieldToUpdate];
      console.log(`[updateComplaint] Captured 'unsure' for people.role; remaining fields: [${updatedMissingFields.join(', ')}]`);
      return {
        complaint: updatedComplaint,
        missingFields: updatedMissingFields,
        fieldAttempts: resetAttempts,
      };
    }
  }
  
  // Handle billing.amount extraction - capture charged vs correct amounts
  if (fieldToUpdate === "billing.amount") {
    // Pattern: "charged X when/it's/should be Y" or "incorrect X correct Y"
    const amountPattern = /(?:charged|was|amount|incorrect|wrong)?\s*[\$]?(\d+[\.,]?\d*)\s*(?:when|but|should be|correct|supposed to be|is|ought to be)\s*[\$]?(\d+[\.,]?\d*)/i;
    const match = userReply.match(amountPattern);
    
    if (match && match[1] && match[2]) {
      const chargedAmount = match[1].replace(/[\.,]/g, '');
      const correctAmount = match[2].replace(/[\.,]/g, '');
      const updatedComplaint = { ...complaint, billing: { ...(complaint.billing || {}), amount: `${chargedAmount} vs ${correctAmount}` } };
      const updatedMissingFields = missingFields.slice(1);
      const fieldAttempts = state.fieldAttempts || {};
      const resetAttempts = { ...fieldAttempts };
      delete resetAttempts[fieldToUpdate];
      console.log(`[updateComplaint] Captured billing amounts: charged ${chargedAmount}, correct ${correctAmount}`);
      return {
        complaint: updatedComplaint,
        missingFields: updatedMissingFields,
        fieldAttempts: resetAttempts,
      };
    }
  }
  
  // NEW: Handle boolean fields for contact details
  if (fieldToUpdate === "contactDetails.isPatient" || fieldToUpdate === "contactDetails.wantsContact") {
    const trimmed = userReply.trim().toLowerCase();
    
    // Use the same affirmative/negative patterns as validation
    if (isAffirmative(trimmed)) {
      // User said yes - update complaint and mark field as collected
      const fieldName = fieldToUpdate.split('.')[1] as any;
      const updatedContactDetails = { ...(complaint.contactDetails || {}), [fieldName]: true };
      const updatedComplaint = { ...complaint, contactDetails: updatedContactDetails };
      const updatedMissingFields = missingFields.slice(1);
      const fieldAttempts = state.fieldAttempts || {};
      const resetAttempts = { ...fieldAttempts };
      delete resetAttempts[fieldToUpdate];
      console.log(`[updateComplaint] Set ${fieldToUpdate} = true`);
      return {
        complaint: updatedComplaint,
        missingFields: updatedMissingFields,
        fieldAttempts: resetAttempts,
      };
    } else if (isNegative(trimmed)) {
      // User said no - update complaint and mark field as collected
      const fieldName = fieldToUpdate.split('.')[1] as any;
      const updatedContactDetails = { ...(complaint.contactDetails || {}), [fieldName]: false };
      const updatedComplaint = { ...complaint, contactDetails: updatedContactDetails };
      const updatedMissingFields = missingFields.slice(1);
      const fieldAttempts = state.fieldAttempts || {};
      const resetAttempts = { ...fieldAttempts };
      delete resetAttempts[fieldToUpdate];
      console.log(`[updateComplaint] Set ${fieldToUpdate} = false`);
      return {
        complaint: updatedComplaint,
        missingFields: updatedMissingFields,
        fieldAttempts: resetAttempts,
      };
    }
  }
  
  // NEW: Handle bundled contact details response (when user provides multiple fields at once)
  const contactFields = ['contactDetails.name', 'contactDetails.email', 'contactDetails.contactNo', 'contactDetails.isPatient', 'contactDetails.wantsContact'];
  if (contactFields.includes(fieldToUpdate)) {
    // First check if user is saying they don't have certain contact info (email/phone)
    const hasNegativeEmail = /don't\s*have|no\s+email|n\/a|not\s*applicable|none/i.test(userReply);
    const hasNegativePhone = /don't\s*have|no\s+phone|can't\s+share|not\s+available/i.test(userReply);
    const hasPhonePreference = /phone|call|tel/i.test(userReply) && !userReply.includes('email');
    
    // Try to extract all contact fields from the response
    const extractMultiplePrompt = `Extract contact information from this user response. IMPORTANT: If user says they don't have email or phone, mark that field as "NOT_PROVIDED" instead of null.

User response: "${userReply}"

Extract these fields:
- name: Full name (or null if not mentioned)
- email: Email address OR "NOT_PROVIDED" if user says they don't have email
- contactNo: Phone number OR "NOT_PROVIDED" if user says they don't have phone
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
        
        let contactDescriptionAppend = '(Contact info: ';
        const contactParts: string[] = [];
        
        if (extracted.name && extracted.name !== "null") {
          updatedComplaint.contactDetails.name = extracted.name;
          contactParts.push(`Name: ${extracted.name}`);
        }
        // Handle email: skip if NOT_PROVIDED or null
        if (extracted.email && extracted.email !== "null" && extracted.email !== "NOT_PROVIDED") {
          updatedComplaint.contactDetails.email = extracted.email;
          contactParts.push(`Email: ${extracted.email}`);
        } else if (extracted.email === "NOT_PROVIDED") {
          delete updatedComplaint.contactDetails.email;
          contactParts.push('Email: Not provided');
        }
        
        // Handle phone: skip if NOT_PROVIDED or null
        if (extracted.contactNo && extracted.contactNo !== "null" && extracted.contactNo !== "NOT_PROVIDED") {
          updatedComplaint.contactDetails.contactNo = extracted.contactNo;
          contactParts.push(`Phone: ${extracted.contactNo}`);
        } else if (extracted.contactNo === "NOT_PROVIDED") {
          delete updatedComplaint.contactDetails.contactNo;
          contactParts.push('Phone: Not provided');
        }
        
        if (extracted.isPatient !== null && extracted.isPatient !== "null") {
          updatedComplaint.contactDetails.isPatient = extracted.isPatient;
          contactParts.push(`Patient: ${extracted.isPatient ? 'Yes' : 'No'}`);
        }
        
        // ENHANCEMENT: Append contact info to description
        if (contactParts.length > 0) {
          contactDescriptionAppend += contactParts.join(', ') + ')';
          if (updatedComplaint.description) {
            updatedComplaint.description = updatedComplaint.description + ' ' + contactDescriptionAppend;
            console.log(`[updateComplaint] Updated description with contact info`);
          }
        }
        
        // Remove all collected contact fields from missingFields
        // IMPORTANT: Count NOT_PROVIDED as "collected" (user explicitly said they don't have it)
        const remainingFields = missingFields.filter((f: string) => {
          if (f === 'contactDetails.name' && extracted.name && extracted.name !== "null") return false;
          if (f === 'contactDetails.email' && (extracted.email === "NOT_PROVIDED" || (extracted.email && extracted.email !== "null" && extracted.email !== "NOT_PROVIDED"))) return false;
          if (f === 'contactDetails.contactNo' && (extracted.contactNo === "NOT_PROVIDED" || (extracted.contactNo && extracted.contactNo !== "null" && extracted.contactNo !== "NOT_PROVIDED"))) return false;
          if (f === 'contactDetails.isPatient' && extracted.isPatient !== null && extracted.isPatient !== "null") return false;
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

IMPORTANT: If this is an email or phone field (contactDetails.email or contactDetails.contactNo):
- If the user says they don't have it (e.g., "don't have email", "no phone"), respond with "NOT_PROVIDED"
- If they provide the value, extract it
- If unclear, respond with "UNKNOWN"

For other fields, if the user says "I don't know" or provides no useful info, respond with "UNKNOWN".

Respond ONLY with the extracted value, nothing else.`;

  const response = await llm.invoke(extractPrompt);
  const extractedValue = response.content.toString().trim();

  console.log(`[updateComplaint] ${Date.now() - t0}ms - Extracted: ${extractedValue.substring(0, 30)}`);

  // For contact fields, handle NOT_PROVIDED as "field collected but user doesn't have it"
  if ((fieldToUpdate === 'contactDetails.email' || fieldToUpdate === 'contactDetails.contactNo') && extractedValue === 'NOT_PROVIDED') {
    console.log(`[updateComplaint] ${Date.now() - t0}ms - User explicitly said they don't have ${fieldToUpdate}, marking as collected`);
    const updatedComplaint = { ...complaint };
    // Keep the field undefined (not provided), but remove from missingFields
    const updatedMissingFields = missingFields.slice(1);
    const fieldAttempts = state.fieldAttempts || {};
    const resetAttempts = { ...fieldAttempts };
    delete resetAttempts[fieldToUpdate];
    return {
      complaint: updatedComplaint,
      missingFields: updatedMissingFields,
      fieldAttempts: resetAttempts,
    };
  }

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

  // ENHANCEMENT: Update description field with extracted information
  // This allows the description to evolve throughout the conversation, showing hospital staff
  // what information was collected and when
  if (extractedValue !== "UNKNOWN" && extractedValue && extractedValue.length > 0) {
    let descriptionAppend = '';
    
    // Generate readable description updates based on field type
    switch(fieldToUpdate) {
      case 'event.date':
        descriptionAppend = `(When: ${extractedValue})`;
        break;
      case 'event.location':
        descriptionAppend = `(Location: ${extractedValue})`;
        break;
      case 'typeOfCare':
        descriptionAppend = `(Service: ${extractedValue})`;
        break;
      case 'impact':
        const impactValue = Array.isArray(extractedValue) ? extractedValue[0] : extractedValue;
        descriptionAppend = `(Impact: ${impactValue})`;
        break;
      case 'people.role':
        descriptionAppend = `(Staff involved: ${extractedValue})`;
        break;
      case 'medication.name':
        descriptionAppend = `(Medication: ${extractedValue})`;
        break;
      case 'billing.amount':
        descriptionAppend = `(Amount: ${extractedValue})`;
        break;
      case 'billing.insuranceStatus':
        descriptionAppend = `(Insurance: ${extractedValue})`;
        break;
      default:
        // For any other field, append it with the field name
        if (!fieldToUpdate.startsWith('contactDetails')) {
          descriptionAppend = `(${fieldToUpdate}: ${extractedValue})`;
        }
    }
    
    // Append to existing description if we have something to add
    if (descriptionAppend && updatedComplaint.description) {
      updatedComplaint.description = updatedComplaint.description + ' ' + descriptionAppend;
      console.log(`[updateComplaint] Updated description with: ${descriptionAppend}`);
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
 * Determine urgency level based on complaint characteristics
 */
function determineUrgency(complaint: any): string {
  let urgencyScore = 0;

  // HIGH urgency indicators
  // Safety-related complaints (CLINICAL domain, especially SAFETY subcategory)
  if (complaint.domain === 'CLINICAL' && complaint.subcategory === 'SAFETY') {
    urgencyScore = 10;
  }
  
  // Severe impacts (Physical symptoms, Safety risk)
  if (complaint.impact && Array.isArray(complaint.impact)) {
    const criticalImpacts = ['PHYSICAL', 'SAFETY_RISK', 'DELAY_IN_CARE'];
    if (complaint.impact.some((i: string) => criticalImpacts.includes(i.toUpperCase()))) {
      urgencyScore = Math.max(urgencyScore, 8);
    }
  }

  // Emergency or recent incident (within last 24-48 hours)
  if (complaint.typeOfCare === 'EMERGENCY') {
    urgencyScore = Math.max(urgencyScore, 8);
  }

  // MEDIUM urgency indicators
  // Clinical complaints (medication, diagnosis, procedure issues)
  if (complaint.domain === 'CLINICAL') {
    urgencyScore = Math.max(urgencyScore, 5);
  }

  // Financial/Billing complaints with significant amounts
  if (complaint.subcategory === 'BILLING' && complaint.billing?.amount) {
    const amount = parseFloat(complaint.billing.amount.replace(/[^0-9.]/g, ''));
    if (!isNaN(amount) && amount > 1000) {
      urgencyScore = Math.max(urgencyScore, 6);
    } else {
      urgencyScore = Math.max(urgencyScore, 4);
    }
  }

  // Wait time complaints
  if (complaint.subcategory === 'WAIT_TIME') {
    urgencyScore = Math.max(urgencyScore, 5);
  }

  // Emotional impact
  if (complaint.impact && Array.isArray(complaint.impact)) {
    if (complaint.impact.some((i: string) => i.toUpperCase() === 'EMOTIONAL')) {
      urgencyScore = Math.max(urgencyScore, 4);
    }
  }

  // LOW urgency indicators (default if no high/medium factors)
  if (urgencyScore === 0) {
    urgencyScore = 2;
  }

  // Map score to urgency level
  if (urgencyScore >= 8) {
    return 'HIGH';
  } else if (urgencyScore >= 5) {
    return 'MEDIUM';
  } else {
    return 'LOW';
  }
}

/**
 * Node 5: generateFinalResponse
 * LLM node that generates patient-facing acknowledgement
 */
export async function generateFinalResponse(state: GraphState): Promise<Partial<GraphState>> {
  const { complaint } = state;

  // SAFEGUARD: If user wants contact but we don't have contact details, don't generate final message yet
  // This ensures contact details are collected before ending the conversation
  const wantsContact = (complaint.contactDetails?.wantsContact as any) === true || (complaint.contactDetails?.wantsContact as any) === 'true';
  
  if (wantsContact) {
    const contactFields = ['name', 'email', 'contactNo'];
    const missingContactFields = contactFields.filter(field => {
      const value = (complaint.contactDetails as any)?.[field];
      return !value || value === 'unknown';
    });
    
    if (missingContactFields.length > 0) {
      console.log(`[generateFinalResponse] User wants contact but missing fields: [${missingContactFields.join(', ')}]. Returning empty to trigger contact detail collection.`);
      // Don't generate final message yet - the conversation should loop back to askQuestion
      // This is a safety measure in case determineMissingFields didn't add contact fields
      return {};
    }
  }

  // Determine urgency level based on complaint characteristics
  const urgency = determineUrgency(complaint);
  
  let finalMessage = '';
  
  if (!wantsContact) {
    // User doesn't want to be contacted - close politely and thank them
    finalMessage = `Thank you for sharing your complaint with us. We sincerely apologize for the inconvenience you experienced. Your feedback is important and will be reviewed by our team to help us improve our services. We appreciate your time.`;
  } else {
    // User wants contact - acknowledge and confirm next steps
    const responsePrompt = `You are a compassionate hospital representative. Generate a brief, empathetic final response acknowledging the patient's complaint and confirming we'll follow up.

Complaint Details:
- Type: ${complaint.subcategory}
- Description: ${complaint.description}
- Contact: ${complaint.contactDetails?.name ? `Name: ${complaint.contactDetails.name}, ` : ''}${complaint.contactDetails?.email ? `Email: ${complaint.contactDetails.email}, ` : ''}${complaint.contactDetails?.contactNo ? `Phone: ${complaint.contactDetails.contactNo}` : ''}

Requirements:
- Acknowledge their concern
- Assure them it will be reviewed
- Confirm we will follow up with them
- State next steps (human review/investigation)
- Be warm but professional
- Keep it to 2-3 sentences

Generate the response:`;

    const response = await llm.invoke(responsePrompt);
    finalMessage = response.content.toString().trim();
  }

  // Add to message history
  const updatedMessages = [...state.messages, new AIMessage(finalMessage)];

  return {
    messages: updatedMessages,
    isComplete: true,
    complaint: {
      ...complaint,
      urgencyLevel: urgency as any,
      needsHumanInvestigation: true,
    },
  };
}
