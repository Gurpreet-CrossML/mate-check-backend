import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { chatHandler } from "./routes/chat";
import { ttsHandler } from "./routes/tts";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/chat", chatHandler);
  app.post("/api/tts", ttsHandler);

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  });

  return app;
}
