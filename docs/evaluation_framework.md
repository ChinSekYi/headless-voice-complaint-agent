# Evaluation Framework

This document outlines what metrics should be tracked and how the system should be evaluated.

## 1. Operational Metrics (Automated Logging)

These are logged to `data/metrics.ndjson` after every conversation.

| Metric | Target | Purpose |
|--------|--------|---------|
| Total Latency (ms) | ≤1500ms (text), ≤3500ms (with TTS) | Ensure the response is fast enough for a real intake flow |
| LLM Latency (ms) | ≤1000ms | Identify LLM bottlenecks |
| STT Latency (ms) | ≤5000ms | Identify audio input bottlenecks |
| TTS Latency (ms) | ≤500ms | Ensure voice response is reasonable |
| Completion Rate (%) | ≥80% | % of conversations that reach isComplete=true |
| Valid Outcome Rate (%) | ≥85% | % of conversations with hadValidOutcome=true |
| Avg Utterances per Session | ≤5 turns | Conversations should be brief; more turns = unhappy users |
| Error Rate (%) | <2% | % of conversations that fail or return non-200 |

## 2. Quality Metrics (Manual Evaluation)

These require human review of the logs.

### 2.1 Classification Accuracy
- **What to measure**: For each completed conversation, is the `complaint.subcategory` correct?
- **Sample**: Review 20-30 random conversations
- **Target**: ≥80% of complaints classified correctly
- **How to do it**: Read the transcript + description, verify the subcategory matches the patient's concern

Example:
```
User said: "I waited 4 hours and no one attended to me"
System classified as: WAIT_TIME ✓
```

### 2.2 Field Completeness
- **What to measure**: For each complaint type, are the required fields collected?
- **Sample**: Group conversations by subcategory; check a few from each type
- **Target**: ≥75% of conversations collected all required fields, OR decided to skip irrelevant fields
- **Required fields by type**: See `src/config/requiredFields.ts`

Example:
```
WAIT_TIME requires: event.date, event.location, typeOfCare
Conversation collected: event.date ✓, event.location ✓, typeOfCare only partially (Emergency, not the exact department)
Score: 2/3 = 67%
```

### 2.3 Response Quality
- **What to measure**: Is the final response empathetic and actionable?
- **Sample**: Review final messages from 10-15 conversations
- **Target**: ≥80% of responses include an apology or empathy statement + clear next steps

Example of good response:
```
"Thank you, Mina, for sharing your complaint with us. We sincerely apologize 
for the inconvenience you experienced. Your feedback is important and will be 
reviewed by our team to help us improve our services. We appreciate your time."
```

## 3. Safety Metrics

### 3.1 Out-of-Schema Rate
- **What to measure**: % of conversations where the LLM returned invalid data (e.g., subcategory not in enum)
- **Sample**: All conversations
- **Target**: <1%
- **Check**: Look for subcategories not in `ComplaintSubcategory` enum

### 3.2 Hallucination Rate
- **What to measure**: Did the agent invent facts not mentioned by the user?
- **Sample**: 10-15 random conversations
- **Target**: 0% (this is critical for healthcare)
- **How to do it**: Compare the stored `description` to the transcript; if the description contains info the user never said, flag it

## 4. User Experience Metrics

### 4.1 Question Relevance
- **What to measure**: Do the clarifying questions actually make sense given the complaint?
- **Sample**: 10-15 conversations with follow-up questions
- **Target**: ≥90% of questions are relevant and contextual
- **How to do it**: Read the question; does it flow naturally from the complaint?

### 4.2 Conversation Drop Rate
- **What to measure**: % of conversations that end without reaching a conclusion
- **Sample**: All conversations
- **Target**: <10% (most should complete)
- **Check**: `isComplete=false` and `hadValidOutcome=false`

## 5. Domain-Specific Metrics (Healthcare)

### 5.1 Urgency Classification Accuracy
- **What to measure**: For HIGH urgency complaints (safety, physical impact, medical), does the system mark them urgently?
- **Sample**: 10 complaints that mention safety/injury/severe impact
- **Target**: ≥90% marked as HIGH or MEDIUM urgency
- **Check**: `fields.urgencyLevel` matches complaint severity

### 5.2 Escalation Readiness
- **What to measure**: For SAFETY complaints, does the system flag them for escalation?
- **Sample**: All conversations with `domain=CLINICAL` and `subcategory=SAFETY`
- **Target**: ≥95% have `needsHumanInvestigation=true`
- **Check**: Flag any with needsHumanInvestigation=false

## 6. How to Run an Evaluation

1. **Pick a sample size**: 20-30 conversations for initial evaluation
2. **Read the transcripts and descriptions**: Open `data/complaints.ndjson` and review manually
3. **Score each dimension**: Classification, fields, response quality
4. **Calculate averages**: e.g., 24/30 = 80% accuracy
5. **Log results**: Create a summary like:
   ```
   ## Evaluation Results (Jan 25, 2026)
   - 30 conversations reviewed
   - Classification accuracy: 80% (24/30)
   - Field completeness: 77% (23/30)
   - Response quality: 87% (26/30)
   - Urgency accuracy: 93% (14/15 high-risk complaints)
   - No hallucinations detected
   - Average latency: 3.2s (well below 3.5s target)
   ```

## 7. What to Optimize Based on Results

If classification accuracy is low:
- Review failed cases; add more examples to system prompts
- Consider stricter enum mapping

If field completeness is low:
- Are questions unclear? Reword them
- Are required fields wrong? Update `requiredFields.ts`

If response quality is low:
- Add more empathy templates
- Include escalation/next-steps messaging

If latency is high:
- Profile: is it LLM, STT, or TTS?
- Consider model optimization or caching

---

## Current Data (Sample Analysis)

From `data/metrics.ndjson` (16 data points):
- **Completion rate**: 75% (12/16 isComplete=true)
- **Valid outcome rate**: 100% (16/16 hadValidOutcome=true)
- **Average total latency**: ~5.2s (range: 1.3s–17s)
- **Average LLM latency**: ~2.1s
- **Average utterances**: ~4.7 per session (well within target of ≤5)
- **Most common type**: WAIT_TIME (50%), ATTITUDE (25%), PROFESSIONALISM (12.5%)

Full transcripts are stored in `data/complaints.ndjson` for qualitative review.
