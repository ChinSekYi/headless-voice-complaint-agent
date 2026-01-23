# Hospital Complaint Types & Resolution Patterns

## Purpose
Research document to inform agent design for hospital complaint classification and response generation.

---

## References
- [Top Common Patient Complaints](https://www.collaboratemd.com/blog/responses-for-top-common-patient-complaints/)
- [Patient complaints in healthcare systems: systematic review and coding taxonomy](https://pmc.ncbi.nlm.nih.gov/articles/PMC4112446/)
- [Communication complaint types and contributory factors (GMC)](https://www.gmc-uk.org/cdn/documents/communication-complaint-types-and-contributory-factors-report_pdf-80571206.pdf)

---

## Summary: Three Broad Domains

Research literature groups patient complaints into three main domains:

### 1. Clinical Care Quality & Safety (33.7%)
**What it covers:**
- Treatment problems (incorrect, delayed, or inadequate)
- Diagnosis issues (delayed, inaccurate, or unclear)
- Medication errors (wrong drug, dose, administration)
- Quality of clinical care (nursing care, thoroughness)

**Examples:**
- "Mistakes in medication prescription"
- "Delayed diagnosis despite multiple visits"
- "Doctor gave me printouts but didn't explain my condition"

---

### 2. Management & Organizational Issues (35.1%)
**What it covers:**
- Waiting times and access delays (appointments, test results)
- Billing and insurance confusion (unclear charges, unexpected costs)
- Administrative errors (lost records, scheduling issues)
- Facility problems (environment, resources)

**Examples:**
- "I waited over 3 hours for my appointment"
- "I don't understand these charges or why insurance wasn't applied"

**Key insight:** Largest complaint category in healthcare systems.

---

### 3. Relationships Between Staff & Patients (29.1%)
**What it covers:**
- Communication issues (unclear explanations, conflicting advice)
- Lack of personal attention or empathy
- Unprofessional or unfriendly behavior
- Respect and dignity concerns (right to be heard, listened to)

**Examples:**
- "Staff seem rushed and don't listen"
- "Doctor gave me printouts but didn't explain my condition"

---

## MVP Agent Mapping

For the demo MVP, we simplified the three research domains into **three actionable complaint types:**

| Complaint Type | Research Domain(s) | Agent Capability | Automation Level |
|---------------|-------------------|------------------|------------------|
| **APPOINTMENT** | Management & Organizational | Reschedule, cancel, check availability, wait times | ✅ High (automatable) |
| **BILLING** | Management & Organizational | Charges, invoices, insurance, payment issues | ✅ High (automatable) |
| **OTHER** | Clinical Care + Staff Relations | General feedback, staff conduct, facilities, medical concerns | ⚠️ Low (requires escalation) |

### Design Rationale
- **APPOINTMENT** and **BILLING** are high-volume, automatable tasks with clear resolution paths
- **OTHER** captures complex concerns requiring human escalation (safety, clinical quality, staff behavior)
- Simplified taxonomy keeps MVP scope manageable while covering real-world distribution
- Pattern matches industry data: ~35% of complaints are management/organizational (our APPOINTMENT + BILLING categories)

---

## Agent Decision Logic

### Classification Strategy
1. **Keyword matching** (fallback): Simple regex patterns for high-confidence cases
2. **LLM classification** (primary): Azure OpenAI for nuanced language understanding

### Response Strategy
- **APPOINTMENT**: Empathetic acknowledgment + clear next steps (schedule team contact)
- **BILLING**: Empathetic acknowledgment + billing department escalation
- **OTHER**: Empathetic acknowledgment + immediate human review

### Follow-up Logic (Optional)
For MVP, follow-up questions are **optional** to keep scope minimal:
- Missing info detection: "When was your appointment?" or "Which invoice?"
- Single-turn only: Avoid complex conversation trees
- Escalate if confidence is low or info remains incomplete
