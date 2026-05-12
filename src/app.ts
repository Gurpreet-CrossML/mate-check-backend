import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { chatHandler } from "./routes/chat";
import { createClipHandler, getClipHandler } from "./routes/clip";
import {
  closeStreamHandler,
  createStreamHandler,
  iceHandler,
  sdpHandler,
  talkHandler,
} from "./routes/streams";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/chat", chatHandler);
  app.post("/api/clip", createClipHandler);
  app.get("/api/clip/:id", getClipHandler);

  app.post("/api/streams", createStreamHandler);
  app.post("/api/streams/:id/sdp", sdpHandler);
  app.post("/api/streams/:id/ice", iceHandler);
  app.post("/api/streams/:id/talk", talkHandler);
  app.delete("/api/streams/:id", closeStreamHandler);

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  });

  return app;
}
