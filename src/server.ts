import express from "express";
import "dotenv/config";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.post("/voice", (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
        return res.status(400).json({ error: "Text is required" });
    }

    // TODO: Later, implement full agent pipeline
    // For now, just echo back the text

    res.json({
      textResponse: `Thank you for your feedback: "${text}". We are looking into this.`,
      complaintType: "OTHER",
      audioBase64: null
    });
  } catch (error) {
    console.error("Error in /voice endpoint:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});
