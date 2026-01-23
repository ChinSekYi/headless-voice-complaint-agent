import express from "express";
import "dotenv/config";
import { createComplaintGraph, createContinuationGraph, type GraphState } from "./agent/index.js";
import { HumanMessage, BaseMessage } from "@langchain/core/messages";
import { v4 as uuidv4 } from "uuid";
import { saveComplaintRecord } from "./storage.js";
import { transcribeAudio, synthesizeSpeech } from "./voiceService.js";

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static("public"));

// Explicitly serve root index.html to fix Vercel routing
app.get("/", (_req, res) => {
  res.sendFile("./public/index.html", { root: process.cwd() });
});

// In-memory session store for multi-turn conversations
const sessions = new Map<string, GraphState>();

// Initialize LangGraphs
const graph = createComplaintGraph();
const continuationGraph = createContinuationGraph();

// Convert LangChain messages into a simple transcript array for storage
function buildTranscript(messages: BaseMessage[]): { role: string; content: string }[] {
  return messages.map((m) => {
    const role = (m as any)?._getType?.() ?? m.constructor?.name ?? "unknown"; // typically 'human' or 'ai'
    const content = typeof m.content === 'string'
      ? m.content
      : Array.isArray(m.content)
        ? m.content.map((p: any) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ')
        : String(m.content ?? '');
    return { role, content };
  });
}

app.post("/voice", async (req, res) => {
  try {
    const t0 = Date.now();
    let { text, sessionId: providedSessionId, audioBase64 } = req.body;
    let transcription: string | null = null;

    // Simple sanitizer to strip emojis and non-text markers that confuse intent parsing
    const sanitizeUserText = (raw: string | null | undefined): string => {
      if (!raw) return "";
      return raw
        .replace(/\p{Extended_Pictographic}/gu, "")
        .replace(/[\uFE0F\u200D]/g, "")
        .replace(/[^\p{L}\p{N}\p{P}\p{Zs}]/gu, " ")
        .trim();
    };
    
    // If audio is provided, transcribe it first
    if (audioBase64 && !text) {
      try {
        const audioBuffer = Buffer.from(audioBase64, 'base64');
        transcription = await transcribeAudio(audioBuffer);
        text = sanitizeUserText(transcription);
        console.log(`[STT] Transcribed: "${text}"`);
      } catch (error) {
        console.error("[STT] Transcription failed:", error);
        return res.status(400).json({ 
          error: "Speech transcription failed", 
          details: error instanceof Error ? error.message : String(error) 
        });
      }
    }
    
    if (!text) {
      return res.status(400).json({ error: "Text or audio is required" });
    }

    // Sanitize raw text input as well
    text = sanitizeUserText(text);

    // Get or create session
    let sessionId = providedSessionId;
    if (!sessionId) {
      sessionId = uuidv4();
    }

    let state: GraphState | undefined = sessions.get(sessionId);
    
    if (!state) {
      // New session - start from beginning
      state = {
        messages: [new HumanMessage(text)],
        complaint: {},
        missingFields: [],
        currentQuestion: undefined,
        isComplete: false,
        needsMoreInfo: false,
        fieldAttempts: {},
        sessionId,
      };
      
      // Run main graph (validate → classify → determineMissing → ask/final)
      const result = await graph.invoke(state) as GraphState;
      sessions.set(sessionId, result);
      
      const totalMs = Date.now() - t0;
      const lastAI = [...result.messages].reverse().find((m) => m._getType?.() === 'ai' || m.constructor.name === 'AIMessage');
      const lastMessage = lastAI || result.messages[result.messages.length - 1];
      const textResponse = lastMessage?.content?.toString() || 'No response';
      
      console.log(`[metrics] sessionId=${sessionId} totalMs=${totalMs} isComplete=${result.isComplete} needsMoreInfo=${result.needsMoreInfo} missingFields=${result.missingFields.length}`);
      
      // Generate audio response
      let audioBase64 = null;
      try {
        audioBase64 = await synthesizeSpeech(textResponse);
        console.log(`[TTS] Synthesized ${audioBase64.length} bytes`);
      } catch (error) {
        console.error("[TTS] Synthesis failed:", error);
        // Continue without audio
      }
      
      return res.json({
        sessionId,
        textResponse,
        complaintType: result.complaint.subcategory,
        isComplete: result.isComplete,
        needsMoreInfo: result.needsMoreInfo,
        audioBase64,
        metrics: { totalMs },
        complaint: result.complaint,
        missingFields: result.missingFields,
        transcription,
      });
    } else {
      // Existing session - user is replying to a question
      state.messages.push(new HumanMessage(text));
      
      console.log(`[DEBUG] Before continuation - subcategory: ${state.complaint.subcategory}, needsMoreInfo: ${state.needsMoreInfo}, missingFields: ${state.missingFields.length}`);
      
      // Run continuation graph (update → determineMissing → ask/final)
      const result = await continuationGraph.invoke(state, { 
        recursionLimit: 10,
      }) as GraphState;
      
      console.log(`[DEBUG] After continuation - subcategory: ${result.complaint.subcategory}, needsMoreInfo: ${result.needsMoreInfo}, missingFields: ${result.missingFields.length}, messageCount: ${result.messages.length}`);
      console.log(`[DEBUG] Last message: ${result.messages[result.messages.length - 1]?.content?.toString().substring(0, 50)}`);
      
      sessions.set(sessionId, result);
      
      const totalMs = Date.now() - t0;
      const lastAI = [...result.messages].reverse().find((m) => m._getType?.() === 'ai' || m.constructor.name === 'AIMessage');
      const lastMessage = lastAI || result.messages[result.messages.length - 1];
      const textResponse = lastMessage?.content?.toString() || 'No response';
      
      console.log(`[metrics] sessionId=${sessionId} totalMs=${totalMs} isComplete=${result.isComplete} needsMoreInfo=${result.needsMoreInfo} missingFields=${result.missingFields.length}`);
      
      // Persist completed complaint and clean up session
      if (result.isComplete) {
        try {
          await saveComplaintRecord({
            sessionId,
            complaint: result.complaint,
            submissionTimeISO: new Date().toISOString(),
            transcript: buildTranscript(result.messages),
          });
        } catch (err) {
          console.warn("Failed to persist complaint:", err);
        }
        sessions.delete(sessionId);
      }
      
      // Generate audio response
      let audioBase64 = null;
      try {
        audioBase64 = await synthesizeSpeech(textResponse);
        console.log(`[TTS] Synthesized ${audioBase64.length} bytes`);
      } catch (error) {
        console.error("[TTS] Synthesis failed:", error);
        // Continue without audio
      }
      
      return res.json({
        sessionId,
        textResponse,
        complaintType: result.complaint.subcategory,
        isComplete: result.isComplete,
        needsMoreInfo: result.needsMoreInfo,
        audioBase64,
        metrics: { totalMs },
        complaint: result.complaint,
        missingFields: result.missingFields,
        transcription,
      });
    }
  } catch (error) {
    console.error("Error in /voice endpoint:", error);
    res.status(500).json({ error: "Internal Server Error", details: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/synthesize", async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }

    const audioBase64 = await synthesizeSpeech(text);
    return res.json({ audioBase64 });
  } catch (error) {
    console.error("Error in /synthesize endpoint:", error);
    res.status(500).json({ error: "Synthesis failed", details: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/end", async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: "Session ID is required" });
    }
    
    // Get the final complaint state from session
    const finalState = sessions.get(sessionId);
    
    if (finalState && finalState.complaint) {
      // Save the complaint to storage
      try {
        await saveComplaintRecord({
          sessionId,
          complaint: finalState.complaint,
          submissionTimeISO: new Date().toISOString(),
          transcript: buildTranscript(finalState.messages || []),
        });
        console.log(`[/end] Saved complaint for session ${sessionId}`);
      } catch (err) {
        console.warn(`[/end] Failed to save complaint: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    
    // Clean up the session
    sessions.delete(sessionId);
    
    return res.json({ 
      success: true, 
      message: "Conversation ended and complaint saved" 
    });
  } catch (error) {
    console.error("Error in /end endpoint:", error);
    res.status(500).json({ error: "Failed to end conversation", details: error instanceof Error ? error.message : String(error) });
  }
});

// Simple health check for serverless /api
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

export default app;
