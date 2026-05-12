import { Request, Response } from "express";

// We use D-ID *Talks* (single-portrait lipsync) instead of *Clips* (multi-shot scenes).
// Talks render in roughly 8-20s vs 30-60s for Clips, with the same input shape.
const D_ID_API_URL = "https://api.d-id.com/talks";

const DEFAULT_SOURCE_URL =
  process.env.D_ID_SOURCE_URL ||
  "https://create-images-results.d-id.com/api_docs/assets/noelle_t.jpeg";
const DEFAULT_VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID || "iP95p4xoKVk53GoZ742B";

type CreateClipBody = {
  text: string;
  sourceUrl?: string;
  voiceId?: string;
};

function authHeader(apiKey: string) {
  return `Basic ${apiKey}`;
}

export async function createClipHandler(req: Request, res: Response) {
  const apiKey = process.env.D_ID_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "D_ID_API_KEY is not set" });

  const { text, sourceUrl, voiceId } = req.body as CreateClipBody;
  if (!text || typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "`text` is required" });
  }

  const body = {
    source_url: sourceUrl ?? DEFAULT_SOURCE_URL,
    script: {
      type: "text",
      input: text,
      subtitles: false,
      provider: { type: "elevenlabs", voice_id: voiceId ?? DEFAULT_VOICE_ID },
    },
    config: {
      stitch: true,
      fluent: true,
      result_format: "mp4",
    },
  };

  try {
    const r = await fetch(D_ID_API_URL, {
      method: "POST",
      headers: {
        Authorization: authHeader(apiKey),
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const t = await r.text();
      return res.status(r.status).json({ error: `D-ID create failed: ${t}` });
    }
    const data = (await r.json()) as { id: string };
    return res.status(202).json({ id: data.id, status: "created" });
  } catch (err) {
    console.error("createClip error:", err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : "D-ID request failed",
    });
  }
}

export async function getClipHandler(req: Request, res: Response) {
  const apiKey = process.env.D_ID_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "D_ID_API_KEY is not set" });

  const id = req.params.id;
  if (!id) return res.status(400).json({ error: "`id` is required" });

  try {
    const r = await fetch(`${D_ID_API_URL}/${encodeURIComponent(id)}`, {
      headers: { Authorization: authHeader(apiKey), accept: "application/json" },
    });
    if (!r.ok) {
      const t = await r.text();
      return res.status(r.status).json({ error: `D-ID poll failed: ${t}` });
    }
    const data = (await r.json()) as {
      status: string;
      result_url?: string;
      error?: { message?: string };
    };
    return res.json({
      id,
      status: data.status,
      videoUrl: data.result_url ?? null,
      error: data.error?.message ?? null,
    });
  } catch (err) {
    console.error("getClip error:", err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : "D-ID request failed",
    });
  }
}
