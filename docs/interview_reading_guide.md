# Voice AI Complaint Agent: 2-Hour Reading Guide

Use this guide if you need to understand the project deeply enough to explain it in an interview.

## Goal
By the end of 2 hours, you should be able to explain:
- what problem the project solves
- who the users and stakeholders are
- how the system flows from input to final response
- why LangGraph was used
- what the main tradeoffs and guardrails are
- where the data goes and how the system is measured

## 0-15 Minutes: Understand the Story
Read:
- [README.md](../README.md)
- [docs/requirements.md](requirements.md)

Focus on answering these questions:
- What real-world pain point does this demo target?
- Who is the patient-facing user?
- Who is the operational user on the receiving end?
- What does success look like for the MVP?

What to extract:
- This is a complaint intake assistant, not a general chatbot.
- The goal is structured intake, not final resolution.
- The system tries to reduce manual back-and-forth while staying safe and bounded.

## 15-35 Minutes: Learn the Runtime Shape
Read:
- [src/app.ts](../src/app.ts)
- [src/server.ts](../src/server.ts)
- [src/storage.ts](../src/storage.ts)
- [src/metrics.ts](../src/metrics.ts)

Focus on:
- What endpoint handles the conversation?
- How does a session get created and reused?
- What gets persisted when a complaint is complete?
- What metrics are recorded?

What to be able to say:
- The backend is an Express app with a root frontend, a voice endpoint, and simple local file storage.
- Completed complaints are appended to NDJSON, not a database.
- Metrics are also logged to NDJSON so the demo can measure latency and completion.

## 35-70 Minutes: Understand the Agent Graph
Read:
- [src/agent/graph.ts](../src/agent/graph.ts)
- [src/agent/graphState.ts](../src/agent/graphState.ts)
- [src/agent/nodes.ts](../src/agent/nodes.ts)
- [docs/langgraph_flow_logic.md](langgraph_flow_logic.md)
- [docs/conversational_agent_instructions.md](conversational_agent_instructions.md)

Focus on:
- What is the state object?
- What are the initial and continuation graphs?
- When does the graph classify, ask, update, or finish?
- Which parts are rule-based and which parts are LLM-based?

Core mental model:
- The state carries messages, the structured complaint, missing fields, a current question, and flags like `needsMoreInfo`.
- The initial graph handles the first user message.
- The continuation graph handles follow-up answers.
- The graph is state-driven, not open-ended.

You should be able to explain these nodes:
- `validateInput`
- `classifyComplaint`
- `determineMissingFields`
- `askClarifyingQuestion`
- `interpretUserResponse`
- `validateExtractedData`
- `updateComplaintFromUserReply`
- `generateFinalResponse`

## 70-90 Minutes: Learn the Domain Model
Read:
- [src/config/complaintSchema.ts](../src/config/complaintSchema.ts)
- [src/config/requiredFields.ts](../src/config/requiredFields.ts)
- [src/config/fieldConfig.ts](../src/config/fieldConfig.ts)
- [src/config/userIntentPatterns.ts](../src/config/userIntentPatterns.ts)
- [src/config/fieldValueMappings.ts](../src/config/fieldValueMappings.ts)
- [src/config/hospitalContext.ts](../src/config/hospitalContext.ts)

Focus on:
- What complaint domains exist?
- What subcategories are supported?
- Which fields are required for each complaint type?
- What gets normalized from free text into canonical values?

What to be able to say:
- The schema is intentionally constrained so the agent can map messy user language into a fixed complaint taxonomy.
- Required fields are not the same for every complaint type.
- Some input handling is rule-based to reduce cost and avoid unnecessary LLM calls.

## 90-105 Minutes: Learn the Voice Layer and UX
Read:
- [src/voiceService.ts](../src/voiceService.ts)
- [public/index.html](../public/index.html)

Focus on:
- How does audio get transcribed?
- How is audio generated for the reply?
- What does the frontend do and not do?

What to be able to say:
- Azure Speech handles both STT and TTS.
- The UI is intentionally simple; the backend owns the workflow logic.
- The frontend does not make the complaint decisions itself.

## 105-120 Minutes: Rehearse the Interview Narrative
Prepare a 60-90 second explanation:
- Problem: hospital complaint intake is unstructured and inefficient
- Solution: a bounded AI agent that classifies, asks targeted questions, and generates a structured handoff
- Stack: LangGraph, Azure OpenAI, Azure Speech, Express, TypeScript
- Tradeoff: use stateful graph control plus small LLM calls instead of a fully autonomous agent
- Outcome: structured complaint intake with latency and quality metrics

## What You Must Know Cold
If an interviewer asks, you should be able to answer these quickly:
- Why did you use LangGraph instead of a single prompt?
- What is the difference between the initial graph and the continuation graph?
- How do you prevent the agent from asking the same question repeatedly?
- How do you handle `I don't know` or skipped answers?
- What is stored in `data/complaints.ndjson`?
- What latency metrics do you log and why?
- What would you improve if this were production?

## Good Follow-Up Topics
If you have more time after the 2 hours, dig into:
- how the taxonomy maps to real hospital operations
- how to evaluate complaint classification quality
- how to reduce LLM calls with more deterministic routing
- how to replace local NDJSON storage with a durable datastore
- how to add human review or escalation workflows

## Interview-Friendly One-Liner
This project is a bounded, voice-enabled hospital complaint intake agent that uses LangGraph to classify complaints, ask only the necessary follow-up questions, and produce a structured handoff for human staff.
