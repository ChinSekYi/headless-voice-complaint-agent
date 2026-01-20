# KeyReply Voice AI Take-Home — FAST MVP INSTRUCTIONS

## Objective
Build a **simple, end-to-end demo** of a Voice AI system for handling hospital patient complaints.

This is a **demo MVP**, not a production system.

Priority order:
1. Working end-to-end flow
2. Clear agent logic
3. Voice support
4. Basic frontend for demo

---

## Constraints (VERY IMPORTANT)
DO:
- Build ONE backend service
- Build ONE minimal demo webpage
- Use Azure APIs for STT, LLM, TTS
- Keep everything simple and readable

DO NOT:
- Build a complex frontend (no React, no Next.js)
- Download or train models
- Implement streaming audio
- Add authentication, database, or dashboards
- Over-engineer abstractions

---

## Tech Stack (LOCKED)
- Node.js
- TypeScript
- Express
- Azure OpenAI (LLM)
- Azure Speech Services (STT + TTS)
- Plain HTML + JS for frontend (served by backend)

No Python. No model downloads.

---

## High-Level Architecture

Browser (HTML)
  → POST /voice
    → (optional) Speech-to-Text
    → Complaint Handling Agent (LLM)
    → Text-to-Speech
  ← text + audio response

Everything runs from ONE Node server.

---

## Folder Structure

src/
  server.ts            # Express server + /voice endpoint
  agent/
    agent.ts           # Complaint agent logic
    states.ts          # Agent states and types
  voice/
    stt.ts             # Azure Speech-to-Text
    tts.ts             # Azure Text-to-Speech
  metrics/
    logger.ts          # Latency + decision logging
public/
  index.html           # Minimal demo UI
.env                   # Azure API keys (never commit)

---

## Agent Design (KEEP SIMPLE)

Agent States:
- CLASSIFY_COMPLAINT
- COLLECT_DETAILS
- RESPOND

Complaint Types:
- APPOINTMENT
- BILLING
- OTHER

Agent Flow:
1. Take user input (text or STT output)
2. Classify complaint type using LLM
3. Ask ONE follow-up question if needed
4. Generate empathetic response
5. (Conceptually) escalate if confidence is low

No conversation memory required.

---

## /voice Endpoint Responsibilities

POST /voice:
- Accept JSON `{ text?: string }`
- Accept optional audio file
- If audio exists → run STT
- Run agent logic using LLM
- Run TTS on final response
- Return:
  {
    textResponse: string,
    complaintType: string,
    audioBase64?: string
  }
- Log latency and agent decisions

---

## Frontend (VERY MINIMAL)

Single HTML page:
- Textarea for complaint input
- Optional audio upload
- Submit button
- Display text response
- Play audio response if provided

No styling required.

---

## Metrics to Log (Console is enough)
- Total request latency
- LLM latency
- STT latency (if used)
- TTS latency (if used)
- Complaint type
- Agent state transitions

---

## Execution Plan (3 Days)

DAY 1:
- Set up Node + TypeScript
- Implement /voice endpoint (TEXT ONLY)
- Implement complaint classification via LLM
- Serve index.html
- Demo works via browser

DAY 2:
- Add Azure Speech-to-Text
- Add Azure Text-to-Speech
- End-to-end voice works
- Frontend unchanged or minimally updated

DAY 3:
- Clean code
- Add clear logs
- Write README explaining:
  - Architecture
  - Agent logic
  - Metrics
  - Tradeoffs
  - Future improvements

---

## Coding Style Guidelines
- Prefer simple functions
- Explicit logic > abstractions
- Readability over cleverness
- MVP first, polish later
