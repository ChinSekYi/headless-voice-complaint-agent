import app from "./app.js";
import { initStorage } from "./storage.js";
import { initMetrics } from "./metrics.js";

const port = process.env.PORT ? Number(process.env.PORT) : 3000;

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  // Initialize storage and metrics
  initStorage().catch(err => console.warn("Storage init failed:", err));
  initMetrics().catch(err => console.warn("Metrics init failed:", err));

  const requiredEnvVars = [
    'AZURE_OPENAI_API_KEY',
    'AZURE_OPENAI_ENDPOINT',
    'AZURE_OPENAI_DEPLOYMENT',
    'AZURE_SPEECH_KEY',
    'AZURE_SPEECH_REGION'
  ];
  const missing = requiredEnvVars.filter(v => !process.env[v]);
  if (missing.length > 0) {
    console.warn(`⚠️  Missing environment variables: ${missing.join(', ')}`);
    console.warn('   Some features will not work. Check your .env file.');
  }
});

