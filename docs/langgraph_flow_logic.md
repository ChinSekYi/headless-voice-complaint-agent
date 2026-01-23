# LangGraph Flow Logic

## Overview
Two separate graphs handle different conversation phases:
1. **Initial Graph** - First user message (new complaint)
2. **Continuation Graph** - Follow-up messages (answering questions)

---

## 1. Initial Complaint Graph (First Message)

**Legend:**
- `[LLM]` = AI-powered node (calls OpenAI)
- `{CONDITION}` = Conditional routing (rule-based decision)
- `[RULE]` = Rule-based processing node

```
┌─────────────────────────────────────────────────────────────────┐
│                          START                                  │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
         ┌────────────────┐
         │ [LLM] VALIDATE │  ← AI checks if input is a complaint
         │  (validateInput)│
         └────────┬───────┘
                  │
                  ▼
        ┌─────────────────────┐
        │ {CONDITION}         │
        │  needsMoreInfo?     │  ← Rule: Check boolean flag
        └─────────┬───────────┘
                  │
         ┌────────┴─────────┐
         │ NO           YES │
         │              ↓   │
         ▼            [END] │ ← Ask clarifying question, wait for user
┌─────────────────┐         │
│ [LLM] CLASSIFY  │         │
│(classifyComplaint)│←──────┘  ← AI categorizes: domain/subcategory/impact
└────────┬────────┘
         │
         ▼
┌──────────────────────┐
│ [LLM] DETERMINE      │  ← AI identifies missing required fields
│      MISSING         │
│(determineMissingFields)│
└──────────┬───────────┘
           │
           ▼
  ┌──────────────────────┐
  │ {CONDITION}          │
  │  missingFields > 0?  │  ← Rule: Check array length
  └──────────┬───────────┘
             │
      ┌──────┴──────┐
      │ YES      NO │
      │          ↓  │
      ▼       ┌─────────────────┐
┌──────────────────┐             │
│ [LLM] ASK        │             │
│    QUESTION      │             │
│(askClarifyingQuestion)│        │
└─────────┬────────┘             │
          │                      ▼
          ▼             ┌──────────────────┐
        [END]           │ [LLM] GENERATE   │  ← AI creates closing message
     Wait for user      │      FINAL       │
                        │(generateFinalResponse)│
                        └────────┬─────────┘
                                 │
                                 ▼
                               [END]
                            Conversation
                             complete
```

### Decision Points (Initial Graph)

| Node | Decision Logic | Outcomes |
|------|---------------|----------|
| **validate** | `state.needsMoreInfo?` | YES → END, NO → classify |
| **determineMissing** | `state.missingFields.length > 0?` | YES → askQuestion, NO → generateFinal |

---

## 2. Continuation Graph (Follow-up Messages)

**Legend:**
- `[LLM]` = AI-powered node (calls OpenAI)
- `{CONDITION}` = Conditional routing (rule-based decision)
- `[RULE]` = Rule-based processing node

```
┌─────────────────────────────────────────────────────────────────┐
│                          START                                  │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
         ┌────────────────┐
         │ [RULE] RESET   │  ← Clear needsMoreInfo flag
         │   (resetState) │
         └────────┬───────┘
                  │
                  ▼
        ┌──────────────────────┐
        │ {CONDITION}          │
        │  Has subcategory?    │  ← Rule: Check if complaint.subcategory exists
        └─────────┬────────────┘
                  │
         ┌────────┴─────────┐
         │ NO           YES │
         │              ↓   │
         ▼         ┌──────────────┐
┌─────────────────┐│ [LLM]        │  ← AI extracts data from user answer
│ [LLM] VALIDATE  ││  INTERPRET   │
│  (validateInput)││(interpretUserResponse)│
└────────┬────────┘└──────┬───────┘
         │                │
         ▼                ▼
┌─────────────────┐┌──────────────────┐
│ [LLM] CLASSIFY  ││ [RULE] UPDATE    │  ← Merge extracted data into complaint
│(classifyComplaint)││(updateComplaintFromUserReply)│
└────────┬────────┘└──────────┬───────┘
         │                    │
         │                    ▼
         │       ┌────────────────────────┐
         │       │ [LLM] VALIDATE         │  ← AI verifies data quality
         │       │      EXTRACTED         │
         │       │(validateExtractedData) │
         │       └──────────┬─────────────┘
         │                  │
         │                  ▼
         │         ┌──────────────────────┐
         │         │ {CONDITION}          │
         │         │   needsMoreInfo?     │  ← Rule: Data invalid/incomplete?
         │         └──────────┬───────────┘
         │                    │
         │            ┌───────┴──────┐
         │            │ YES       NO │
         │            │ ↓            │
         │          [END]           │
         │       Ask for            │
         │      clarification       │
         │                          │
         └──────────┬───────────────┘
                    │
                    ▼
       ┌───────────────────────┐
       │ [LLM] DETERMINE       │  ← AI re-checks what's still needed
       │      MISSING          │
       │(determineMissingFields)│
       └──────────┬────────────┘
                  │
                  ▼
         ┌──────────────────────┐
         │ {CONDITION}          │
         │  missingFields > 0?  │  ← Rule: Check array length
         └──────────┬───────────┘
                    │
           ┌────────┴──────┐
           │ YES        NO │
           │            ↓  │
           ▼       ┌──────────────────┐
┌──────────────────┐│ [LLM] GENERATE   │
│ [LLM] ASK        ││      FINAL       │
│    QUESTION      ││(generateFinalResponse)│
│(askClarifyingQuestion)│└────────┬─────────┘
└─────────┬────────┘            │
          │                     ▼
          ▼                   [END]
        [END]              Conversation
     Ask next               complete
     question
```

### Decision Points (Continuation Graph)

| Node | Decision Logic | Outcomes |
|------|---------------|----------|
| **reset** | `state.complaint.subcategory exists?` | YES → interpret, NO → validate |
| **validate** | `state.needsMoreInfo?` | YES → END, NO → classify |
| **validateExtracted** | `state.needsMoreInfo?` | YES → END, NO → determineMissing |
| **determineMissing** | `state.missingFields.length > 0?` | YES → askQuestion, NO → generateFinal |

---

## Key Differences Between Graphs

| Aspect | Initial Graph | Continuation Graph |
|--------|--------------|-------------------|
| **Entry Point** | Always validate | Reset → check if classified |
| **Classification** | Always classify after validate | Only if not already classified |
| **Data Extraction** | Built into classify | Explicit interpret → update → validateExtracted |
| **Purpose** | Understand new complaint | Extract info from answer |

---

## Node Type Breakdown

### 🤖 LLM-Powered Nodes (AI Processing)
**Calls:** `await llm.invoke(prompt)` - Makes OpenAI API call

| Node | Function | What AI Does | Latency Impact |
|------|----------|--------------|----------------|
| `validateInput` | Check if input is complaint-related | Analyzes text intent | ~2-3s |
| `classifyComplaint` | Categorize complaint | Maps to domain/subcategory/impact | ~2-3s |
| `determineMissingFields` | Identify missing required fields | Compares extracted vs required fields | ~2-3s |
| `askClarifyingQuestion` | Generate context-aware question | Creates natural question (max 5 total) | ~2-3s |
| `interpretUserResponse` | Extract structured data from free text | Parses answer into structured fields | ~2-3s |
| `validateExtractedData` | Verify data quality | Checks if answer is valid/usable | ~2-3s |
| `generateFinalResponse` | Create closing message | Composes empathetic final message | ~2-3s |

**Total LLM nodes per conversation:** 3-7 calls (depending on follow-ups)

---

### 📊 Conditional Routing (Rule-Based Decisions)
**Logic:** Pure JavaScript boolean/comparison checks - **instant (< 1ms)**

| Decision Point | Rule | Outcomes |
|----------------|------|----------|
| After `validate` | `state.needsMoreInfo === true` | YES → END, NO → classify |
| After `reset` | `state.complaint.subcategory !== undefined` | YES → interpret, NO → validate |
| After `validateExtracted` | `state.needsMoreInfo === true` | YES → END, NO → determineMissing |
| After `determineMissing` | `state.missingFields.length > 0` | YES → askQuestion, NO → generateFinal |

**Implementation:** Uses `addConditionalEdges()` with JavaScript functions like:
```typescript
function shouldAskQuestion(state: GraphState): string {
  if (state.missingFields && state.missingFields.length > 0) {
    return "askQuestion";
  }
  return "generateFinal";
}
```

---

### ⚙️ Rule-Based Processing Nodes (Deterministic Logic)
**Logic:** JavaScript data manipulation - **instant (< 1ms)**

| Node | Function | What It Does |
|------|----------|--------------|
| `resetState` | Clear `needsMoreInfo` flag | Sets `needsMoreInfo = false` to prepare for next turn |
| `updateComplaintFromUserReply` | Merge extracted data | Object spread: `{ ...complaint, ...extractedData }` |

---

### Performance Comparison

| Node Type | Count per Session | Avg Time | % of Total Latency |
|-----------|------------------|----------|-------------------|
| **LLM Nodes** | 3-7 | ~2384ms each | **92%** |
| **Conditional Routing** | 4-8 | < 1ms each | **< 0.1%** |
| **Rule-Based Nodes** | 1-3 | < 1ms each | **< 0.1%** |
| **TTS (post-LLM)** | 1 | ~203ms | **8%** |

**Key Insight:** LLM nodes dominate latency (92%). Routing and rule-based logic is negligible.

---

## State Object (Passed Between Nodes)

```typescript
interface GraphState {
  messages: BaseMessage[];        // Conversation history
  complaint: ComplaintData;       // Structured complaint data
  missingFields: string[];        // Fields still needed
  currentQuestion?: string;       // Last question asked
  isComplete: boolean;           // Conversation finished?
  needsMoreInfo: boolean;        // Need clarification?
  fieldAttempts: Record<string, number>;  // Track question count per field
  sessionId: string;             // Unique conversation ID
}
```

Each node reads the state, performs its logic, and returns updated state fields.

---

## Interview Talking Points

### 1. **Progressive Questioning Strategy**
- Max 5 questions total per conversation
- Asks ONE field at a time (not bundled)
- Tracks `fieldAttempts` to avoid repeating questions
- Explicitly allows "don't know" responses

### 2. **Hybrid Architecture**
- **LLM for understanding**: Natural language → structured data
- **Rules for control flow**: When to ask, when to finish
- Keeps latency predictable while maintaining conversational quality

### 3. **Stateful Conversation**
- Session state persists across turns
- Continuation graph picks up where initial graph left off
- No re-classification on follow-ups (efficiency)

### 4. **Error Handling**
- `needsMoreInfo` flag triggers END to wait for user clarification
- `validateExtractedData` ensures data quality before proceeding
- Graceful degradation (continues even if fields missing)

### 5. **Outcome Validation**
Valid outcome = `isComplete` OR `(userProvidedInfo && missingFields ≤ 2)`
- Flexible definition: doesn't require 100% field coverage
- Balances data completeness with user experience
