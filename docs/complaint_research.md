
Hospital complaint types:
Source: https://www.collaboratemd.com/blog/responses-for-top-common-patient-complaints/

Patient complaints in healthcare systems: a systematic review and coding taxonomy: https://pmc.ncbi.nlm.nih.gov/articles/PMC4112446/

"Communication
complaint types and
contributory factors" : https://www.gmc-uk.org/cdn/documents/communication-complaint-types-and-contributory-factors-report_pdf-80571206.pdf


Summary:
Three Broad Domains of Complaints

The literature groups patient complaints into three main domains:

Clinical care quality & safety (33.7%)
These relate to the actual healthcare delivered, including treatment choices, safety, diagnosis, and outcomes.

Management & organisational issues (35.1%)
These relate to how the system or service works, such as delays, waiting times, access, and bureaucracy.

Relationships between staff & patients (29.1%)
These relate to communication, empathy, staff behaviour, and patient rights.


📌 Categories & Examples (Flattened)

Rather than 200+ codes, here’s a practical, smaller set that covers most common issues — ideal for your agent’s complaint types:

1. Clinical Care & Safety

Treatment problems: incorrect, delayed, or inadequate treatment

Diagnosis issues: delayed, inaccurate, or unclear diagnosis

Medication errors (wrong drug, dose, administration problems)

Quality of clinical care (poor nursing care, lack of thoroughness)

Examples:

“Mistakes in medication prescription.”

“Delayed diagnosis despite multiple visits.”

2. Management Problems

Waiting times / access delays (appointments, test results)

Billing / insurance confusion (unclear charges, unexpected costs)
(Often cited in practice contexts outside the systematic review but common in real complaints)

Administrative errors (lost records, scheduling issues)

Facility problems (environment, resources)

Examples:

“I waited over 3 hours for my appointment.”

“I don’t understand these charges or why insurance wasn’t applied.”

3. Staff-Patient Relationship Issues

Communication issues: not explained clearly, conflicting advice

Lack of personal attention / empathy

Unprofessional or unfriendly behaviour

Respect & dignity complaints (right to be heard, listened to)

Examples:

“Staff seem rushed and don’t listen.”

“Doctor gave me printouts but didn’t explain my condition.”


🧠 How Hospitals Typically Handle Complaints (Workflow Insight)

Healthcare organisations often:

Record the complaint (formal intake)

Classify the subject (type & domain)

Investigate internally

Respond with acknowledgement + resolution or explanation

Monitor for patterns (quality improvement)

Your agent doesn’t need the full loop — it needs to mirror steps 1–4 in conversation: intake → classification → information gathering → response.


🧠 Why This Matters for LangGraph

Instead of one single output (e.g., complaintType), your agent should consider multiple dimensions of a complaint:

Suggested variables to capture
Variable	Type	Notes
complaintType	Enum	e.g., CLINICAL, MANAGEMENT, RELATIONSHIP
subType	Enum/List	e.g., DIAGNOSIS, WAIT_TIME, COMMUNICATION
urgency	Enum	QUICK, NORMAL, HIGH (triage)
missingInfo	Array	fields agent must collect next
confidence	Number	LLM confidence score
🧩 Example Complaints & How To Map Them (Useful for Prompting Routines)
Example Complaint	Domain	Subcategory
“The doctor never explained my diagnosis.”	RELATIONSHIP	COMMUNICATION
“My surgery was delayed without notice.”	MANAGEMENT	WAIT_TIME
“I was given the wrong medication.”	CLINICAL	TREATMENT / MEDICATION_ERROR
“I don’t understand why my bill is so high.”	MANAGEMENT	BILLING

These categories can be used as labels or decision paths in your LangGraph flow.


Task: The agent’s job is to produce a high-quality, structured complaint record so humans can investigate properly later.
🧠 What the Agent Is Really Doing

The agent is acting like a trained hospital complaints officer whose job is to:

Listen empathetically

Ask the right clarifying questions

Ensure required details are captured

Produce a complete, structured complaint record

Decide if escalation is needed

This is agentic behavior, not chat.


---

✅ Why YOUR design is agentic

Your agent:

1️⃣ Decides what information is needed

Based on complaint type

Not pre-defined for all users

→ This is decision-making

2️⃣ Chooses which question to ask next

From missing fields

One at a time

Priority-based

→ This is planning

3️⃣ Adapts based on user answers

Skips questions if answered implicitly

Accepts “I don’t know”

Changes urgency if risk appears

→ This is reactivity

4️⃣ Has a stop condition

Completeness reached

Max questions reached

Safety threshold crossed

→ This is goal-directed behavior

5️⃣ Produces a structured artifact

Not just chat text

A complaint record usable by humans

→ This is task completion, not conversation

3️⃣ The Agent’s “Goal” (This Is Important)

Your agent’s goal is not:

“Have a conversation”

It is:

“Produce an investigation-ready complaint record with minimal user effort.”

Every question is justified by that goal.

interview reply:
"“The agent maintains an internal complaint state and dynamically determines which information is missing based on complaint type. It plans and asks targeted clarifying questions one at a time, adapts based on user responses, and stops once it reaches a completeness threshold or safety condition. This makes it goal-directed and adaptive, rather than a static form or chatbot.”