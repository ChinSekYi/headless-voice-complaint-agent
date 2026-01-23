# Target Users & Needs (MVP)

Primary users:
- Patients: calling or submitting complaints about appointments, billing, or general care.
- Hospital staff (triage): need clear, structured info to route quickly.

Top needs:
- Fast, empathetic first response (≤2s text; ≤4s with TTS).
- Correct classification: APPOINTMENT, BILLING, OTHER.
- Minimal, targeted follow-up (collect only essentials).
- Clear next steps (who will follow up, expected timeline).

Key scenarios:
- Appointment issues: reschedule/cancel, doctor availability, long wait.
- Billing issues: unexpected charges, insurance questions, invoice disputes.
- Other: facilities, staff conduct, general feedback.

Constraints (MVP):
- Single turn (no memory).
- API-only; no auth or DB.
- Non-streaming audio; batch STT/TTS.

# Success Metrics (MVP)

Primary (agent quality):
- Classification accuracy: % of complaints correctly mapped to APPOINTMENT/BILLING/OTHER.
- Slot completeness: % of required fields collected per type.
- Empathy/clarity proxy: % responses that include apology + next steps (rule-based check).

Operational (pipeline):
- Total latency (ms): end-to-end request time.
- LLM latency (ms).
- STT latency (ms).
- TTS latency (ms).
- Error rate: % of requests with non-200.
- Availability: uptime of /voice.

UX:
- First response time: time to text response.
- Follow-up rate: % cases requiring COLLECT_DETAILS.
- Drop rate: % empty/invalid inputs.

Safety:
- Escalation rate: % routed to human (conceptual flag).
- Invalid output rate: LLM returns out-of-schema.

Suggested log schema (console):
{
  totalMs,
  llmMs,
  sttMs,
  ttsMs,
  complaintType,
  decisionPath,      // e.g., ["CLASSIFY_COMPLAINT","RESPOND"]
  hadFollowUp: boolean,
  error: string | null
}

Targets (MVP):
- TotalMs: ≤1500ms (text-only), ≤3500ms (with TTS).
- Classification accuracy: ≥80% with simple rules+LLM.
- Error rate: <2% under normal inputs.


Success, end of day (MVP) means:

Patient submits a complaint (text or audio).
System classifies it (APPOINTMENT, BILLING, OTHER).
System asks at most one targeted follow‑up if key slot missing.
System returns a clear, empathetic text response and audio (if TTS enabled) within latency targets.
System logs metrics (totalMs, llmMs, sttMs, ttsMs, complaintType, decisionPath).
System produces a structured handoff payload staff could act on (no DB; console/log only).
