## Headless Voice Complaint Agent

An end-to-end demo that turns a patient complaint into a structured intake record using text or voice.

The project is deliberately narrow: it does not try to solve the complaint, replace human staff, or support open-ended chat. It focuses on one operational problem in healthcare intake: patients often describe issues in unstructured language, while hospital staff need a clean, categorized handoff with the minimum required fields collected.

the core story is:
- Take a patient complaint in text or audio
- Classify it into a hospital-friendly complaint taxonomy
- Ask only the minimum necessary clarifying questions
- Return an empathetic response and a structured handoff payload
- Log latency and outcome metrics so the flow can be evaluated

---

### Tech Stack
- Node.js + TypeScript
- Express (HTTP server)
- Azure OpenAI (LLM)
- Azure Speech Services (STT/TTS)
- Plain HTML + JS (served from `public/`)

### Problem Statement
Hospital complaint intake is often unstructured and repetitive. This demo uses an AI agent to turn a patient complaint into a structured handoff with minimal follow-up, while staying bounded and safe.

### Stakeholders
- Patients
- Triage / complaint handling staff
- Hospital operations / service owners
- Product / AI team

### Expected Impact
- Less manual rework
- Faster first response
- Better complaint completeness
- Clearer latency and outcome metrics

---

### Project Structure
```
src/
  app.ts         # Express app (routes)
  server.ts      # Local dev bootstrap
  storage.ts     # NDJSON storage to data/complaints.ndjson
  agent/         # Agent graph + nodes
  config/        # Complaint schema + mappings
  voiceService.ts# STT/TTS via Azure Speech SDK
public/
  index.html     # Minimal demo UI
data/
  complaints.ndjson (created at runtime)
```

---

### Setup
1. Create `.env` from example:
   cp .env.example .env
2. Fill required vars:
   - AZURE_OPENAI_API_KEY
   - AZURE_OPENAI_ENDPOINT
   - AZURE_OPENAI_DEPLOYMENT
   - AZURE_SPEECH_KEY
   - AZURE_SPEECH_REGION

Install deps:
```bash
npm ci
```

Run locally:
```bash
npm run dev
# http://localhost:3000
```

---

### Deploy (Vercel)
- Push to `main` triggers deploy.
- Root route serves `public/index.html`.
- Health: GET /health → `{ status: "ok" }`.

---

### API
- POST /voice: `{ text?: string, audioBase64?: string }` → complaint handling, returns text + optional audioBase64.
- POST /synthesize: `{ text: string }` → TTS to audioBase64.
- POST /end: `{ sessionId: string }` → persist transcript to NDJSON.
- GET /health: status check.

---

### Results

Sample evaluation on ~16 conversations (from `data/metrics.ndjson` and `data/complaints.ndjson`):

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| **Completion Rate** | 75% (12/16) | ≥80% | ⚠️ Close |
| **Valid Outcome Rate** | 100% (16/16) | ≥85% | ✅ Pass |
| **Avg Total Latency** | 5.2s | ≤3.5s | ⚠️ Over (includes STT) |
| **Avg LLM Latency** | 2.1s | ≤1.0s | ⚠️ Over |
| **Avg Utterances per Session** | 4.7 turns | ≤5 turns | ✅ Pass |
| **Error Rate** | 0% (0/16) | <2% | ✅ Pass |

**Complaint Type Distribution**:
- WAIT_TIME: 50%
- ATTITUDE: 25%
- PROFESSIONALISM: 12.5%
- Other: 12.5%

**Notes**:
- Total latency includes STT (audio transcription). Text-only latency averages ~2.8s, meeting the target.
- Full transcripts are logged in `data/complaints.ndjson` for qualitative review (classification accuracy, response quality, field completeness).
- See [docs/evaluation_framework.md](docs/evaluation_framework.md) for detailed evaluation methodology and manual quality checks.


### Notes
- Data is stored locally as NDJSON (no DB).
- For production, replace file storage with a real datastore.
