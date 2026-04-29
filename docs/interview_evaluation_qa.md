# Interview Q&A: Evaluation Framework

## Q1: What evaluation framework do you use for this project?

**A (60 seconds):**
I use a **three-layer evaluation approach**:

**Layer 1 — Operational Metrics (automated, always logged):**
- Completion rate: Did the agent reach end of intake? (75% in current data)
- Valid outcome rate: Did we produce usable structured data? (100% in current data)
- Latency: How fast? (5.2s avg, 2.8s for text-only, dominated by LLM inference ~2.1s)
- Error rate: Did the system crash or fail? (0% in current data)

**Layer 2 — Quality Evaluation (LLM judges for all content checks):**
- Classification accuracy: Did we pick the right complaint domain? (LLM scores, target ≥80%)
- Field completeness: Did we extract all required fields? (LLM scores, target ≥75%)
- Response quality: Were clarifying questions natural and relevant? (LLM scores, target ≥80%)
- Safety checks: Any out-of-schema outputs? Hallucinations? Safety flags missed? (LLM scores)
- UX checks: Are questions relevant? Any loops? (LLM scores)

**Layer 3 — Validation & Calibration (human spot-checks):**
- Does the LLM judge agree with human expert judgment?
- Are there healthcare-specific edge cases the LLM misses?
- Is the rubric drifting? Needs recalibration?
- Are safety-critical decisions reliable?

Current results: 75% completion, 100% valid outcomes, 5.2s latency, 0% errors.

---

## Q2: Manual review doesn't scale. How do you handle evaluation at a consulting firm?

**A (75 seconds):**
Great question — that's exactly what I thought about. Here's the scaling strategy:

**Automated layer (fast, cheap):** Latency, completion, errors — these are deterministic and log automatically. No human needed.

**LLM judges (scales to millions):** For quality checks—classification accuracy, field completeness, response quality, safety (out-of-schema, hallucinations, safety flags), and UX—I use GPT-4 to score transcripts against a rubric. Feed it the transcript, the extracted fields, the required-fields schema, and the safety criteria—it gives scores in seconds. Cost ≈ $0.01-0.02 per conversation. This handles quality evaluation at scale.

**Human validation (strategic):** I don't re-review all conversations. Instead, I spot-check the *LLM judge itself*. Pick 10 conversations (mix of high and low scores), human reads them and checks: "Does the LLM's assessment match reality?" If agreement >85%, the judge is calibrated. If not, adjust the rubric. This catches domain-specific blindspots and healthcare edge cases the judge might miss.

Result: You get production-grade evaluation at scale without manual review of every conversation. For Temus, this means: deploy, log automatically, run LLM judge nightly, validate judge weekly with human spot-checks, alert on failures. Scales indefinitely.

---

## Q3: What does "valid outcome rate" mean? Why is it 100% if completion is only 75%?

**A (45 seconds):**
Key distinction:

- **Completion rate (75%):** Did the user reach the final recap/confirmation step?
- **Valid outcome (100%):** Did we extract enough structured data to forward to staff, even if the user didn't complete the full intake?

Example: A user complains about medication, we classify it correctly, extract the drug name and symptom, ask one clarifying question, then leaves. That's "incomplete" (didn't finish the intake) but "valid outcome" (staff got actionable info: medication complaint, specific drug, symptom). They don't need the extra fields to start an investigation.

So 75% completion but 100% valid outcomes means: *even the "incomplete" ones were useful to the hospital*.

---

## Q4: What's your target for each metric, and why?

**A (60 seconds):**

| Metric | Target | Why |
|--------|--------|-----|
| **Completion Rate** | ≥70% | Not all users finish; this is normal. 75% is solid. |
| **Valid Outcome** | ≥95% | Staff need *something* actionable. 100% is ideal but 95%+ is production-ready. |
| **Classification Accuracy** | ≥80% | Wrong domain = wrong department. 80% means ~1 in 5 might need reclassification. |
| **Field Completeness** | ≥75% | Some fields aren't always needed; 75% means most required fields are captured. |
| **Response Quality** | ≥80% | Agent asks useful, natural follow-ups. |
| **Latency** | <8s | Keep user engaged. 5.2s is good; 10+s risks abandonment. |
| **Error Rate** | ~0% | System shouldn't crash. Current: 0%. |

These targets balance: "good enough for deployment" vs. "not gold-plating."

---

## Q5: How do you detect which conversations "failed"?

**A (45 seconds):**

Currently, I track:
- `isComplete`: boolean (reached final recap?)
- `hadValidOutcome`: boolean (extracted enough data?)

But I'm missing: **failure reasons**. Did the user abandon? Hit max questions? Timeout? Network error? This is important for debugging.

For production, I'd add:
- Abandonment reason (explicit: user said "no" / implicit: timeout after 2 min silence)
- Max questions hit (agent asked ≥5 clarifications, still missing fields)
- System error (crash/API failure)

This turns "75% completion" into "60% finished normally, 10% max questions hit, 5% abandoned, 0% system error." Much more actionable—tells you where to improve the agent.

---

## Q6: Can you give an example of a "spot-check" human review?

**A (90 seconds):**

Sure. Here's what I'd do:

1. **Automated run:** LLM judge scores 100 conversations against the rubric (classification, completeness, quality, safety, UX). Takes 2 minutes, costs ~$1.50.

2. **Human validates the judge:** Pick 10 conversations—5 where LLM scored high (>80%), 5 where it scored low (<70%).

3. **Human answers:** "Do you agree with the LLM's assessment? Why or why not?" For example:
   - LLM scored classification as "correct" — human agrees or disagrees?
   - LLM scored safety as "no hallucinations" — human spot-checks the transcript to verify.
   - LLM scored completeness as "75%" — human spot-checks required fields were actually collected.

4. **Measure agreement:** If human and LLM agree >85%, the judge is calibrated. If <80%, the rubric needs adjustment.

5. **Update if needed:** If human found edge cases the LLM missed (e.g., a subtle safety concern), update the rubric or provide example training data.

Example: LLM flagged "no safety issues" but human reads transcript, spots a complaint about medication error that wasn't explicitly marked. This tells me the safety rubric needs to infer implicit safety signals better.

This cycle runs weekly. You validate the judge's accuracy, catch domain-specific blindspots, costs ~30 min human time per 1,000 conversations. The human isn't re-doing all evaluation—they're validating the automation.

---

## Q7: How do you explain the 5.2-second latency to stakeholders? Is that good?

**A (60 seconds):**

Depends on context. Let me break it down:

**5.2s total = ~3s STT (Azure Speech) + ~2.1s LLM (GPT-4) + ~0.2s TTS (Azure Speech)**

For a real-time conversation, 5 seconds feels long—users notice it. But context matters:

- **If voice-only (STT + TTS): 5.2s is reasonable.** Users expect AI to "think." Faster than a human on hold.
- **If text-only (no STT/TTS): ~2.8s** — much better. This is the true agent inference time.

**To stakeholders:** "The agent responds in 5 seconds via voice, 3 seconds via text. Most time is speech recognition/synthesis, not thinking. For a hospital intake chatbot, this is acceptable—faster than a human transfer."

**To engineers:** "LLM inference is 2.1s avg (GPT-4 latency bottleneck). If we switch to a smaller model or fine-tune, we could hit 1-1.5s. Worth testing."

Current results are good; there's room to optimize if needed.

---

## Q8: What would you change in evaluation for a production system at scale?

**A (90 seconds):**

Three things:

1. **Explicit failure indexing:** Log *why* conversations didn't complete. Right now it's just `isComplete: false`. Add: `failureReason: "abandoned" | "maxQuestionsHit" | "timeout" | "systemError"`. Lets you diagnose trends.

2. **Real-time alerts:** Fire a Slack alert if:
   - Error rate spikes >1%
   - Completion rate drops below 65%
   - LLM judge flags 3+ safety-sensitive issues in an hour
   
   This catches problems the day they happen, not in weekly review.

3. **Feedback loop:** Collect data on what hospital staff actually *did* with the extracted data. Did they:
   - Use all the fields? (Which ones are noise?)
   - Reclassify the complaint? (LLM judge is wrong?)
   - Request more info? (Agent should ask different questions?)
   
   This closes the loop: evaluation isn't just about the agent; it's about downstream impact.

Right now, evaluation lives in logs. At scale, it should live in dashboards + alerts + feedback loops. That's production-grade.

---

## Quick Cheat Sheet (If you get stuck)

| Q | 30-second answer |
|----|---|
| **Evaluation framework?** | Three layers: automated metrics (latency, completion, errors) + LLM judges for all quality checks (classification, completeness, quality, safety, UX) + human spot-checks of the LLM judge itself. Current: 75% completion, 100% valid outcome, 5.2s latency, 0% errors. |
| **How to scale?** | Automated layer is free. LLM judges score at ~$0.02/conversation. Human validation is *of the judge*, not of every conversation—spot-check weekly. Total: ~$10 per 1,000 conversations + 30 min human time to validate judge accuracy. |
| **Valid outcome vs. completion?** | Different things. Completion = user finished the intake. Valid outcome = staff got enough info to act, even if intake wasn't complete. |
| **Targets?** | 70% completion, 95% valid outcome, ≥80% LLM judge accuracy (validated by human spot-checks), <8s latency. |
| **Main gap?** | Not logging failure reasons. Next step: add `failureReason` field to understand *why* 25% didn't complete. |
