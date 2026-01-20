import express from "express";
import "dotenv/config";
import { handleComplaint } from "./agent/agents.js";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.post("/voice", async (req, res) => {
  try {
    const t0 = Date.now();
    const { text } = req.body;
    
    if (!text) {
        return res.status(400).json({ error: "Text is required" });
    }

    const result = await handleComplaint(text);
    const totalMs = Date.now() - t0;
    console.log(`[metrics] totalMs=${totalMs} llmMs=${result.llmMs} usedLLM=${result.usedLLM} type=${result.complaintType} path=${result.decisionPath.join("→")}`);

    // TODO: Later, implement full agent pipeline
    // For now, just echo back the text

    res.json({
      textResponse: result.responseText,
      complaintType: result.complaintType,
      audioBase64: null,
      metrics: { totalMs, llmMs: result.llmMs, usedLLM: result.usedLLM }
    });
  } catch (error) {
    console.error("Error in /voice endpoint:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});
