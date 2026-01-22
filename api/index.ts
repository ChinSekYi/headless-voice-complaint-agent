import app from "../src/app.js";

export default function handler(req: any, res: any) {
  // Delegate to Express app
  return (app as any)(req, res);
}
