import { BaseMessage } from "@langchain/core/messages";
import { Annotation } from "@langchain/langgraph";
import { Complaint } from "../config/complaintSchema.js";

/**
 * LangGraph state for the conversational complaint handler
 * Based on docs/conversational_agent_instructions.md
 * Using Annotation API for proper type inference
 */
export const GraphStateAnnotation = Annotation.Root({
  /** Full chat history (user + assistant messages) */
  messages: Annotation<BaseMessage[]>({
    reducer: (prev, next) => next,
    default: () => [],
  }),
  
  /** Structured complaint being built incrementally */
  complaint: Annotation<Partial<Complaint>>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({}),
  }),
  
  /** Fields that still need to be collected based on subcategory */
  missingFields: Annotation<string[]>({
    reducer: (prev, next) => next,
    default: () => [],
  }),
  
  /** Last clarifying question asked to user (for context) */
  currentQuestion: Annotation<string | undefined>({
    reducer: (prev, next) => next ?? prev,
    default: () => undefined,
  }),
  
  /** Whether the complaint intake is complete */
  isComplete: Annotation<boolean>({
    reducer: (prev, next) => next,
    default: () => false,
  }),
  
  /** Whether agent needs more info to proceed with classification */
  needsMoreInfo: Annotation<boolean>({
    reducer: (prev, next) => next,
    default: () => false,
  }),
  
  /** Session ID for tracking multi-turn conversations */
  sessionId: Annotation<string | undefined>({
    reducer: (prev, next) => next ?? prev,
    default: () => undefined,
  }),
  
    /** Track how many times we've asked about each field (to avoid frustrating repeats) */
    fieldAttempts: Annotation<Record<string, number>>({
      reducer: (prev, next) => ({ ...prev, ...next }),
      default: () => ({}),
    }),
});

export type GraphState = typeof GraphStateAnnotation.State;

