# src/ — Backend Source Code

## Overview

The `src/` folder contains all backend logic for the Voice AI complaint handling system.

---

## Folder Structure

```
src/
├── server.ts           # Express server entry point + /voice endpoint
├── agent/              # Complaint handling AI agent
│   ├── agent.ts        # Main agent logic (orchestrates the flow)
│   └── states.ts       # Agent state types & complaint classifications
├── voice/              # Audio processing (Azure Speech Services)
│   ├── stt.ts          # Speech-to-Text (audio → text)
│   └── tts.ts          # Text-to-Speech (text → audio)
├── metrics/            # Logging & monitoring
│   └── logger.ts       # Performance metrics & decision logging
└── README.md           # This file
```

---

## What Each Part Does

### 📡 `server.ts`
- **Purpose**: Express server entry point
- **Responsibilities**:
  - Starts the Node.js server
  - Defines the `POST /voice` endpoint
  - Receives requests from the frontend
  - Orchestrates STT → Agent → TTS pipeline
  - Returns text + audio responses

### 🤖 `agent/` — Complaint Agent
- **What it is**: The "brain" of the system
- **How it works**:
  1. Receives user complaint (text or transcribed audio)
  2. Classifies complaint type (APPOINTMENT, BILLING, OTHER)
  3. Optionally asks a follow-up question
  4. Generates an empathetic response
  5. Returns structured decision

**Files**:
- `states.ts`: TypeScript types for agent state machine
- `agent.ts`: Implements the three-state flow (CLASSIFY → COLLECT → RESPOND)

### 🎤 `voice/` — Audio Processing
- **What it is**: Integration with Azure Speech Services
- **Responsibilities**:

  **`stt.ts` (Speech-to-Text)**:
  - Converts audio files to text using Azure Speech API
  - Input: Audio buffer (wav, mp3, etc.)
  - Output: Transcribed text string

  **`tts.ts` (Text-to-Speech)**:
  - Converts AI response text to audio using Azure Speech API
  - Input: Text string
  - Output: Audio buffer (base64 for frontend playback)

### 📊 `metrics/`
- **What it is**: Logging & performance tracking
- **Tracks**:
  - Total request latency
  - LLM processing time
  - STT processing time (if used)
  - TTS processing time (if used)
  - Complaint type classified
  - Agent state transitions
- **Output**: Console logs (simple, no database)

---

## Request Flow

```
Browser Request
    ↓
POST /voice (server.ts)
    ↓
Audio Input? → STT (voice/stt.ts) → Text
    ↓
Agent Process (agent/agent.ts)
    ├─ Classify complaint type
    ├─ Ask follow-up (optional)
    └─ Generate response
    ↓
TTS (voice/tts.ts) → Audio from response
    ↓
Log Metrics (metrics/logger.ts)
    ↓
Return { textResponse, audioBase64, complaintType }
    ↓
Browser Displays + Plays Audio
```

---

## Data Types

See `agent/states.ts` for all TypeScript interfaces:

```typescript
AgentState:  CLASSIFY_COMPLAINT | COLLECT_DETAILS | RESPOND
ComplaintType: APPOINTMENT | BILLING | OTHER
AgentContext: { userInput, complaintType, state, confidence, response }
RequestMetrics: { totalLatency, llmLatency, sttLatency, ttsLatency, ... }
```

---

## Implementation Checklist

- [ ] `server.ts` — Express setup + /voice endpoint
- [ ] `agent/agent.ts` — Complaint classification & response generation
- [ ] `voice/stt.ts` — Azure Speech-to-Text integration
- [ ] `voice/tts.ts` — Azure Text-to-Speech integration
- [ ] `metrics/logger.ts` — Request logging

---

## Environment Variables

All Azure API keys go in `.env`:

```
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_ENDPOINT=
AZURE_SPEECH_KEY=
AZURE_SPEECH_REGION=
```

---

## Notes

- All files use TypeScript
- Simple, readable functions (no over-abstraction)
- Azure APIs are called via SDK / HTTP requests
- No local model downloads
- Metrics logged to console only
