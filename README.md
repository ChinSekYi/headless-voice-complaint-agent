# KeyReply Voice AI Take-Home — MVP Instructions

## Objective
Build a **simple, end-to-end demo** of a Voice AI system for handling hospital patient complaints.

This is a **demo MVP**, not a production system.

**Priority order:**
1. Working end-to-end flow
2. Clear agent logic
3. Voice support (STT + TTS)
4. Minimal frontend for demonstration

---

## Constraints (VERY IMPORTANT)

**DO:**
- Build ONE backend service
- Build ONE minimal demo webpage
- Use Azure APIs for STT, LLM, TTS
- Keep logic simple, explicit, and readable
- Use software engineering/AI best practices

**DO NOT:**
- Build a complex frontend (no React, no Next.js)
- Download or train models
- Implement streaming audio
- Add authentication, database, or dashboards
- Over-engineer abstractions

---

## Tech Stack (LOCKED)
- **Node.js** — JavaScript runtime
- **TypeScript** — Type-safe language
- **Express** — Web server framework
- **Azure OpenAI** — LLM for classification & responses
- **Azure Speech Services** — STT + TTS
- **Plain HTML + JS** — Frontend (served by backend)

No Python. No model downloads.

---

## High-Level Architecture

```
Browser (HTML)
   ↓
POST /voice
   ↓
(optional) Speech-to-Text
   ↓
Complaint Handling Agent
   ↓
Text-to-Speech
   ↓
Text + Audio Response
```

Everything runs from ONE Node.js server.

---

## Folder Structure

```
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
```

---

## Agent Design (KEEP SIMPLE)

**Agent States:**
- `CLASSIFY_COMPLAINT` — Categorize complaint using LLM
- `COLLECT_DETAILS` — Ask ONE follow-up question if required info is missing (optional)
- `RESPOND` — Generate empathetic response

**Complaint Types:**
- `APPOINTMENT` — Reschedule, cancel, doctor availability, wait times
- `BILLING` — Charges, invoices, insurance, payment issues
- `OTHER` — Facilities, staff conduct, general feedback

**Agent Flow:**
1. Take user input (text or STT output)
2. Classify complaint type using LLM
3. *(Optional)* Ask ONE follow-up question if details missing
4. Generate empathetic response with LLM
5. *(Conceptually)* Escalate if confidence is low

**Memory:**
- No conversation memory required (single-turn)
- Stateless agent for MVP

---

## /voice Endpoint Responsibilities

**POST /voice:**

**Input:**
- JSON `{ text?: string }`
- Optional audio file

**Flow:**
1. If audio exists → run STT
2. Pass text to agent
3. Agent classifies complaint
4. Agent generates response
5. Run TTS on response
6. Log metrics

**Response:**
```json
{
  "textResponse": "string",
  "complaintType": "APPOINTMENT | BILLING | OTHER",
  "audioBase64": "string | null",
  "metrics": {
    "totalMs": number,
    "llmMs": number,
    "usedLLM": boolean
  }
}
```

---

## Frontend (VERY MINIMAL)

**Single HTML page:**
- Textarea for complaint input
- Optional audio upload
- Submit button
- Display text response
- Play audio response if provided

No styling required.

---

## Metrics to Log (Console is enough)

- **Total request latency** — End-to-end time
- **LLM latency** — Time for classification + response
- **STT latency** — Audio → text conversion time (if used)
- **TTS latency** — Text → audio conversion time (if used)
- **Complaint type** — APPOINTMENT, BILLING, or OTHER
- **Agent decision path** — State transitions (e.g., CLASSIFY_COMPLAINT → RESPOND)
- **Used LLM** — `true` if LLM was used, `false` if keyword fallback

**Example log:**
```
[metrics] totalMs=773 llmMs=771 usedLLM=true type=APPOINTMENT path=CLASSIFY_COMPLAINT→RESPOND
```

---

## Execution Plan (3 Days)

### DAY 1:
- [x] Set up Node + TypeScript
- [x] Implement agent (classify → respond)
- [x] Implement `/voice` endpoint (text only)
- [x] Serve `index.html`
- [x] Full demo works via browser

### DAY 2:
- [ ] Add Azure Speech-to-Text
- [ ] Add Azure Text-to-Speech
- [ ] End-to-end voice works
- [ ] Frontend updated for audio upload

### DAY 3:
- [ ] Clean code
- [ ] Add clear logs
- [ ] Write README explaining:
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
