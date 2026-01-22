import app from "../src/app.js";

export default async function handler(req: any, res: any) {
  // Vercel serverless handler - delegate to Express app
  await new Promise((resolve, reject) => {
    (app as any)(req, res, (err?: any) => {
      if (err) reject(err);
      else resolve(undefined);
    });
  });
}
