## Headless Voice Complaint Agent

End-to-end demo for handling hospital complaints via text or voice. Minimal HTML frontend, Express backend, Azure for LLM + Speech. Deployed on Vercel.

---

### 📺 Demo
<p align="center">
  <video src="https://github.com/user-attachments/assets/7a2108d7-eebf-4be1-9e34-8c7ba89c43e8" width="100%" controls muted></video>
</p>

### Tech Stack
- Node.js + TypeScript
- Express (HTTP server)
- Azure OpenAI (LLM)
- Azure Speech Services (STT/TTS)
- Plain HTML + JS (served from `public/`)

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

### Notes
- Data is stored locally as NDJSON (no DB).
- For production, replace file storage with a real datastore.
