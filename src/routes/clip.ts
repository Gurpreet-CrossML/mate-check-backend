import { Request, Response } from "express";

const D_ID_API_URL = "https://api.d-id.com/clips";

const DEFAULT_PRESENTER_ID =
  process.env.D_ID_PRESENTER_ID || "v2_public_alex@qcvo4gupoy";
const DEFAULT_VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID || "iP95p4xoKVk53GoZ742B";

type CreateClipBody = {
  text: string;
  presenterId?: string;
  voiceId?: string;
  bgColor?: string;
};

async function createClip(args: Required<Pick<CreateClipBody, "text">> & CreateClipBody, apiKey: string) {
  const requestBody: Record<string, any> = {
    script: {
      type: "text",
      input: args.text,
      subtitles: false,
      provider: {
        type: "elevenlabs",
        voice_id: args.voiceId ?? DEFAULT_VOICE_ID,
      },
    },
    config: {
      result_format: "mp4",
      fluent: true,
      driver_expressions: { expressions: [], transition_frames: 0 },
    },
    presenter_id: args.presenterId ?? DEFAULT_PRESENTER_ID,
  };

  if (args.bgColor && /greenscreen/i.test(requestBody.presenter_id)) {
    requestBody.background = { color: args.bgColor };
  }

  const res = await fetch(D_ID_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${apiKey}`,
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`D-ID create failed (${res.status}): ${text}`);
  }
  return (await res.json()) as { id: string };
}

async function pollClip(clipId: string, apiKey: string, opts = { maxAttempts: 60, intervalMs: 1000 }) {
  for (let i = 0; i < opts.maxAttempts; i++) {
    const res = await fetch(`${D_ID_API_URL}/${clipId}`, {
      headers: { Authorization: `Basic ${apiKey}`, accept: "application/json" },
    });
    if (!res.ok) throw new Error(`D-ID poll failed (${res.status}): ${res.statusText}`);
    const data = (await res.json()) as { status: string; result_url?: string; error?: { message?: string } };
    if (data.status === "done") return data;
    if (data.status === "error") throw new Error(`D-ID clip error: ${data.error?.message ?? "unknown"}`);
    await new Promise((r) => setTimeout(r, opts.intervalMs));
  }
  throw new Error("D-ID polling timed out");
}

export async function clipHandler(req: Request, res: Response) {
  const apiKey = process.env.D_ID_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "D_ID_API_KEY is not set" });

  const { text, presenterId, voiceId, bgColor } = req.body as CreateClipBody;
  if (!text || typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "`text` is required" });
  }

  try {
    const created = await createClip({ text, presenterId, voiceId, bgColor }, apiKey);
    const result = await pollClip(created.id, apiKey);
    return res.json({
      id: created.id,
      videoUrl: result.result_url,
      status: result.status,
    });
  } catch (err) {
    console.error("clip error:", err);
    const msg = err instanceof Error ? err.message : "D-ID request failed";
    return res.status(500).json({ error: msg });
  }
}
