import { StateGraph, END } from "@langchain/langgraph";
import { GraphStateAnnotation, GraphState } from "./graphState.js";
import {
  classifyComplaint,
  determineMissingFields,
  askClarifyingQuestion,
  updateComplaintFromUserReply,
  generateFinalResponse,
} from "./nodes.js";

// Export GraphState type for use in server
export type { GraphState };

/**
 * LangGraph workflow for conversational complaint handling
 * Follows flowchart in docs/diagrams/Flowchart.jpg
 * 
 * Flow:
 * START → classify → determineMissing → conditional:
 *   - if missingFields.length > 0 → ask → END (wait for user)
 *   - else → generateFinal → END
 * 
 * When user replies:
 * START → update → determineMissing → (loop)
 */

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
    .addNode("classify", classifyComplaint)
    .addNode("determineMissing", determineMissingFields)
    .addNode("askQuestion", askClarifyingQuestion)
    .addNode("generateFinal", generateFinalResponse)
    .addEdge("__start__", "classify")
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
 */
export function createContinuationGraph() {
  const workflow = new StateGraph(GraphStateAnnotation)
    .addNode("update", updateComplaintFromUserReply)
    .addNode("determineMissing", determineMissingFields)
    .addNode("askQuestion", askClarifyingQuestion)
    .addNode("generateFinal", generateFinalResponse)
    .addEdge("__start__", "update")
    .addEdge("update", "determineMissing")
    .addConditionalEdges("determineMissing", shouldAskQuestion, {
      askQuestion: "askQuestion",
      generateFinal: "generateFinal",
    })
    .addEdge("askQuestion", END)
    .addEdge("generateFinal", END);

  return workflow.compile();
}
