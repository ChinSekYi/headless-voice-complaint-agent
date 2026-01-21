import { AzureChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { GraphState } from "./graphState.js";
import { ComplaintDomain, ComplaintSubcategory } from "../config/complaintSchema.js";
import { RequiredFieldsBySubcategory } from "../config/requiredFields.js";

/**
 * LangGraph nodes for conversational complaint handling
 * Based on docs/conversational_agent_instructions.md and docs/diagrams/Flowchart.jpg
 */

// Initialize Azure OpenAI LLM
const llm = new AzureChatOpenAI({
  azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY!,
  azureOpenAIEndpoint: process.env.AZURE_OPENAI_ENDPOINT!,
  azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_DEPLOYMENT!,
  azureOpenAIApiVersion: "2024-02-15-preview",
  temperature: 0.7,
});

/**
 * Node 1: classifyComplaint
 * LLM node that analyzes user input and classifies complaint domain + subcategory
 */
export async function classifyComplaint(state: GraphState): Promise<Partial<GraphState>> {
  const lastMessage = state.messages[state.messages.length - 1];
  const userInput = lastMessage?.content?.toString() || "";

  const classifyPrompt = `You are a hospital complaint intake specialist. Analyze this complaint and classify it.

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

Respond ONLY with JSON in this exact format:
{
  "domain": "CLINICAL" | "MANAGEMENT" | "RELATIONSHIP",
  "subcategory": "<one of the subcategories above>",
  "description": "<brief summary of the complaint in 1-2 sentences>"
}`;

  const response = await llm.invoke(classifyPrompt);
  const content = response.content.toString();
  
  try {
    // Extract JSON from response (handle cases where LLM adds explanation)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in LLM response");
    }
    
    const classification = JSON.parse(jsonMatch[0]);
    
    return {
      complaint: {
        ...state.complaint,
        domain: classification.domain as ComplaintDomain,
        subcategory: classification.subcategory as ComplaintSubcategory,
        description: classification.description,
      },
    };
  } catch (error) {
    console.error("Classification parsing error:", error);
    // Fallback: keep existing complaint state
    return {};
  }
}

/**
 * Node 2: determineMissingFields
 * Pure function (no LLM) that identifies missing required fields
 */
export function determineMissingFields(state: GraphState): Partial<GraphState> {
  const { complaint } = state;
  
  if (!complaint.subcategory) {
    return { missingFields: [] };
  }

  const requiredFields = RequiredFieldsBySubcategory[complaint.subcategory] || [];
  const missingFields: string[] = [];

  for (const field of requiredFields) {
    const [topLevel, subField] = field.split(".");
    
    if (topLevel && subField) {
      // Check nested fields (e.g., "event.date")
      const topLevelObj = complaint[topLevel as keyof typeof complaint] as any;
      if (!topLevelObj || !topLevelObj[subField]) {
        missingFields.push(field);
      }
    } else {
      // Check top-level fields (e.g., "typeOfCare")
      if (!complaint[field as keyof typeof complaint]) {
        missingFields.push(field);
      }
    }
  }

  return { missingFields };
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
  
  const questionPrompt = `You are a compassionate hospital intake specialist. You need to collect one piece of information from the patient.

Complaint Type: ${complaint.subcategory}
Missing Field: ${fieldToAsk}

Generate a natural, empathetic question to collect this information. Keep it brief (1 sentence).

Examples:
- For "event.date": "When did this occur?"
- For "billing.amount": "What was the charge amount on your bill?"
- For "medication.name": "Which medication was involved?"
- For "people.role": "Who were you interacting with? (e.g., doctor, nurse, receptionist)"

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
 * Node 4: updateComplaintFromUserReply
 * LLM node that extracts structured info from user's reply and updates complaint
 */
export async function updateComplaintFromUserReply(state: GraphState): Promise<Partial<GraphState>> {
  const lastMessage = state.messages[state.messages.length - 1];
  const userReply = lastMessage?.content?.toString() || "";
  const { currentQuestion, complaint, missingFields } = state;

  if (!currentQuestion || !missingFields || missingFields.length === 0) {
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
