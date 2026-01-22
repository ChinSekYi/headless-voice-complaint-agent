import { promises as fs } from "fs";
import path from "path";
import type { Complaint } from "./config/complaintSchema.js";

const DATA_DIR = path.join(process.cwd(), "data");
const FILE_PATH = path.join(DATA_DIR, "complaints.ndjson");

export async function initStorage(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(FILE_PATH);
  } catch {
    await fs.writeFile(FILE_PATH, "");
  }
}

export async function saveComplaintRecord(params: {
  sessionId: string;
  complaint: Partial<Complaint>;
  submissionTimeISO: string;
  transcript: { role: string; content: string }[];
}): Promise<void> {
  const { sessionId, complaint, submissionTimeISO, transcript } = params;
  const record = {
    sessionId,
    submissionTime: submissionTimeISO,
    description: complaint.description ?? "",
    urgency: complaint.urgencyLevel ?? null,
    fields: complaint, // store the full collected fields object
    transcript: transcript ?? [],
  };
  const line = JSON.stringify(record) + "\n";
  await fs.appendFile(FILE_PATH, line, { encoding: "utf8" });
}
