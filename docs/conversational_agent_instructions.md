# LangGraph Conversational Agent — Implementation Instructions

This document describes how to implement the **conversational complaint-handling chatbot**
using **LangGraph**, based on the **existing codebase and diagrams**.

This is an extension of the current MVP, not a redesign.

---

## Source of Truth (IMPORTANT)

The following already exist and MUST be reused:

- `/config/complaintSchema.ts`
  - Defines complaint domains, subcategories, enums, and types
- `/config/requiredFields.ts`
  - Defines required fields per complaint type
- `/docs/diagrams/Flowchart.jpg`
  - Miro diagram describing the conversation flow

❗ **Do not redefine schemas or enums inside LangGraph.**
LangGraph must import and reference these files directly.

---

## This IS a Chatbot

The agent:
- Maintains conversational state
- Accepts user input turn by turn
- Asks clarifying questions
- Updates internal complaint state
- Responds naturally to the user

However:
- It is NOT open-ended
- It follows a defined workflow
- It stops once intake is complete

---

## Goal of the LangGraph Agent

To guide the user through a **multi-turn conversation** that:

1. Understands the complaint
2. Classifies it using existing enums
3. Identifies missing required fields
4. Asks **one clarifying question at a time**
5. Produces:
   - A structured complaint record (internal)
   - A patient-facing response (external)

---

## Graph State (MUST MATCH FLOWCHART)

The LangGraph state should minimally include:

```ts
interface GraphState {
  messages: BaseMessage[];        // full chat history
  complaint: Partial<Complaint>;  // imported from complaintSchema
  missingFields: string[];        // derived from requiredFields.ts
  currentQuestion?: string;       // last question asked
  isComplete: boolean;
}
```
Required LangGraph Nodes

Implement nodes that correspond directly to the Miro flowchart:

1. classifyComplaint

LLM node

Uses user input to populate:

complaint.domain

complaint.subcategory

2. determineMissingFields

Pure function (no LLM)

Uses /config/requiredFields.ts

Populates missingFields

3. askClarifyingQuestion

LLM node

Asks ONE question for ONE missing field

Stores question in currentQuestion

Sends question to user

4. updateComplaintFromUserReply

LLM node

Extracts structured information from the user’s reply

Updates complaint

Does NOT reclassify unless explicitly required

5. generateFinalResponse

LLM node

Generates:

Patient-facing acknowledgement

Internal structured summary

Sets:

complaint.needsHumanInvestigation = true

isComplete = true

Graph Flow (Follow Diagram Exactly)
START
  → classifyComplaint
  → determineMissingFields
  → if missingFields.length > 0
       → askClarifyingQuestion
       → updateComplaintFromUserReply
       → determineMissingFields   (LOOP)
    else
       → generateFinalResponse
       → END


This loop is mandatory.

Conversation Rules (NON-NEGOTIABLE)

Ask only ONE clarifying question per turn

Do not overwhelm the user

Allow “I don’t know” as a valid response

Do not promise resolution

Do not escalate automatically

Stop once minimum required fields are collected

Frontend Integration (Current + Future)

The frontend sends user messages turn-by-turn

The backend returns:

Next assistant message

Updated conversation state (implicit)

No streaming required

Frontend does NOT manage logic

What This Demonstrates

This implementation shows:

Agentic control flow

State-driven conversation

Separation of schema, logic, and LLM reasoning

Healthcare-safe intake design

This is intentionally not over-engineered.

Final Note

If LangGraph behavior deviates from the Miro flowchart,
the flowchart takes priority.