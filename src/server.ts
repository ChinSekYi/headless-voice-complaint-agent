import express from "express";
import "dotenv/config";
import { createComplaintGraph, createContinuationGraph, type GraphState } from "./agent/index.js";
import { HumanMessage } from "@langchain/core/messages";
import { v4 as uuidv4 } from "uuid";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

// In-memory session store for multi-turn conversations
const sessions = new Map<string, GraphState>();

// Initialize LangGraphs
const graph = createComplaintGraph();
const continuationGraph = createContinuationGraph();

app.post("/voice", async (req, res) => {
  try {
    const t0 = Date.now();
    const { text, sessionId: providedSessionId } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }

    // Get or create session
    let sessionId = providedSessionId;
    if (!sessionId) {
      sessionId = uuidv4();
    }

    let state = sessions.get(sessionId);
    
    if (!state) {
      // New session - start from beginning
      state = {
        messages: [new HumanMessage(text)],
        complaint: {},
        missingFields: [],
        currentQuestion: undefined,
        isComplete: false,
        sessionId,
      };
      
      // Run main graph (classify → determineMissing → ask/final)
      const result = await graph.invoke(state) as GraphState;
      sessions.set(sessionId, result);
      
      const totalMs = Date.now() - t0;
      const lastMessage = result.messages[result.messages.length - 1];
      
      console.log(`[metrics] sessionId=${sessionId} totalMs=${totalMs} isComplete=${result.isComplete} missingFields=${result.missingFields.length}`);
      
      return res.json({
        sessionId,
        textResponse: lastMessage?.content?.toString() || 'No response',
        complaintType: result.complaint.subcategory,
        isComplete: result.isComplete,
        audioBase64: null,
        metrics: { totalMs },
      });
    } else {
      // Existing session - user is replying to a question
      state.messages.push(new HumanMessage(text));
      
      // Run continuation graph (update → determineMissing → ask/final)
      const result = await continuationGraph.invoke(state, { 
        recursionLimit: 10,
      }) as GraphState;
      
      sessions.set(sessionId, result);
      
      const totalMs = Date.now() - t0;
      const lastMessage = result.messages[result.messages.length - 1];
      
      console.log(`[metrics] sessionId=${sessionId} totalMs=${totalMs} isComplete=${result.isComplete} missingFields=${result.missingFields.length}`);
      
      // Clean up completed sessions
      if (result.isComplete) {
        sessions.delete(sessionId);
      }
      
      return res.json({
        sessionId,
        textResponse: lastMessage?.content?.toString() || 'No response',
        complaintType: result.complaint.subcategory,
        isComplete: result.isComplete,
        audioBase64: null,
        metrics: { totalMs },
      });
    }
  } catch (error) {
    console.error("Error in /voice endpoint:", error);
    res.status(500).json({ error: "Internal Server Error", details: error instanceof Error ? error.message : String(error) });
  }
});

app.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
  
  // Validate required environment variables
  const requiredEnvVars = [
    'AZURE_OPENAI_API_KEY',
    'AZURE_OPENAI_ENDPOINT',
    'AZURE_OPENAI_DEPLOYMENT'
  ];
  
  const missing = requiredEnvVars.filter(v => !process.env[v]);
  if (missing.length > 0) {
    console.warn(`⚠️  Missing environment variables: ${missing.join(', ')}`);
    console.warn('   LLM features will not work. Check your .env file.');
  }
});
