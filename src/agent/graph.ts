import { StateGraph, END } from "@langchain/langgraph";
import { GraphStateAnnotation, GraphState } from "./graphState.js";
import {
  resetState,
  validateInput,
  classifyComplaint,
  determineMissingFields,
  askClarifyingQuestion,
  interpretUserResponse,
  updateComplaintFromUserReply,
  validateExtractedData,
  generateFinalResponse,
} from "./nodes.js";

// Export GraphState type for use in server
export type { GraphState };

/**
 * LangGraph workflow for conversational complaint handling
 * Follows flowchart in docs/diagrams/Flowchart.jpg
 * 
 * Flow:
 * START → validate → classify → determineMissing → conditional:
 *   - if missingFields.length > 0 → ask → END (wait for user)
 *   - else → generateFinal → END
 * 
 * When user replies:
 * START → validate → classify OR update → determineMissing → (loop)
 */

/**
 * Conditional edge function: decides next node after validation in continuation
 */
function shouldProceedToClassifyInContinuation(state: GraphState): string {
  if (state.needsMoreInfo) {
    return "end";
  }
  // If we don't have a classified complaint yet, classify
  if (!state.complaint.subcategory) {
    return "classify";
  }
  // If we already have a classified complaint, update with new info
  return "update";
}

/**
 * Conditional edge function: decides next node after validation
 */
function shouldProceedToClassify(state: GraphState): string {
  if (state.needsMoreInfo) {
    return "end";
  }
  return "classify";
}

/**
 * Conditional edge function: decides next node after determineMissingFields
 */
function shouldAskQuestion(state: GraphState): string {
  if (state.missingFields && state.missingFields.length > 0) {
    return "askQuestion";
  }
  return "generateFinal";
}

/**
 * Build and compile the main LangGraph (for initial complaints)
 */
export function createComplaintGraph() {
  const workflow = new StateGraph(GraphStateAnnotation)
    .addNode("validate", validateInput)
    .addNode("classify", classifyComplaint)
    .addNode("determineMissing", determineMissingFields)
    .addNode("askQuestion", askClarifyingQuestion)
    .addNode("generateFinal", generateFinalResponse)
    .addEdge("__start__", "validate")
    .addConditionalEdges("validate", shouldProceedToClassify, {
      end: END,
      classify: "classify",
    })
    .addEdge("classify", "determineMissing")
    .addConditionalEdges("determineMissing", shouldAskQuestion, {
      askQuestion: "askQuestion",
      generateFinal: "generateFinal",
    })
    .addEdge("askQuestion", END)
    .addEdge("generateFinal", END);

  return workflow.compile();
}

/**
 * Build and compile the continuation graph (for user replies to questions)
 * This graph should SKIP validate if we already have a classified complaint
 */
export function createContinuationGraph() {
  const workflow = new StateGraph(GraphStateAnnotation)
    .addNode("reset", resetState)
    .addNode("validate", validateInput)
    .addNode("classify", classifyComplaint)
    .addNode("interpret", interpretUserResponse)
    .addNode("update", updateComplaintFromUserReply)
    .addNode("validateExtracted", validateExtractedData)
    .addNode("determineMissing", determineMissingFields)
    .addNode("askQuestion", askClarifyingQuestion)
    .addNode("generateFinal", generateFinalResponse)
    // Start with reset to clear needsMoreInfo flag from previous round
    .addEdge("__start__", "reset")
    // After reset, check if we have a classified complaint
    .addConditionalEdges("reset", (state: GraphState) => {
      if (state.complaint.subcategory) {
        // Already classified, interpret the follow-up response
        return "interpret";
      } else {
        // Not classified yet, validate first
        return "validate";
      }
    }, {
      validate: "validate",
      interpret: "interpret",
    })
    .addConditionalEdges("validate", shouldProceedToClassify, {
      end: END,
      classify: "classify",
    })
    .addEdge("classify", "determineMissing")
    .addEdge("interpret", "update")
    .addEdge("update", "validateExtracted")
    .addConditionalEdges("validateExtracted", (state: GraphState) => {
      // If validation failed (needs more info), end conversation and wait for user
      if (state.needsMoreInfo) {
        return "end";
      }
      // Otherwise proceed to determine next missing fields
      return "determineMissing";
    }, {
      end: END,
      determineMissing: "determineMissing",
    })
    .addConditionalEdges("determineMissing", shouldAskQuestion, {
      askQuestion: "askQuestion",
      generateFinal: "generateFinal",
    })
    .addEdge("askQuestion", END)
    .addEdge("generateFinal", END);

  return workflow.compile();
}

