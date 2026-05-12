import { Request, Response } from "express";

const D_ID_BASE = "https://api.d-id.com/talks/streams";

const DEFAULT_SOURCE_URL =
  process.env.D_ID_SOURCE_URL ||
  "https://crosml-public.s3.us-east-1.amazonaws.com/Screenshot_from_2026-05-12_18-28-49-removebg-preview.png";
const DEFAULT_VOICE_ID =
  process.env.ELEVENLABS_VOICE_ID || "iP95p4xoKVk53GoZ742B";

function authHeader(apiKey: string) {
  return `Basic ${apiKey}`;
}

async function callDid(
  url: string,
  apiKey: string,
  init: { method: string; body?: any } = { method: "GET" },
  label: string
): Promise<{ status: number; data: any; ok: boolean }> {
  try {
    const r = await fetch(url, {
      method: init.method,
      headers: {
        Authorization: authHeader(apiKey),
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const text = await r.text();
    const data = text ? safeJson(text) : {};
    if (!r.ok) {
      console.error(`[${label}] D-ID ${r.status} body=`, text.slice(0, 500));
    }
    return { ok: r.ok, status: r.status, data };
  } catch (e) {
    console.error(`[${label}] fetch threw:`, e);
    return {
      ok: false,
      status: 502,
      data: { error: e instanceof Error ? e.message : "upstream fetch failed" },
    };
  }
}

function safeJson(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return { raw: s };
  }
}

export async function createStreamHandler(req: Request, res: Response) {
  const apiKey = process.env.D_ID_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "D_ID_API_KEY is not set" });

  const sourceUrl = (req.body?.sourceUrl as string) || DEFAULT_SOURCE_URL;
  const { ok, status, data } = await callDid(
    D_ID_BASE,
    apiKey,
    { method: "POST", body: { source_url: sourceUrl } },
    "create"
  );
  if (!ok) return res.status(status).json({ error: data });
  return res.json(data);
}

export async function sdpHandler(req: Request, res: Response) {
  const apiKey = process.env.D_ID_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "D_ID_API_KEY is not set" });

  const { id } = req.params;
  const { session_id, answer } = req.body ?? {};
  if (!id || !session_id || !answer) {
    return res.status(400).json({ error: "id, session_id, answer required" });
  }
  console.log("[sdp] in", { id, session_id, answer_type: answer?.type, sdp_len: answer?.sdp?.length });
  const { ok, status, data } = await callDid(
    `${D_ID_BASE}/${encodeURIComponent(id)}/sdp`,
    apiKey,
    { method: "POST", body: { session_id, answer } },
    "sdp"
  );
  if (!ok) return res.status(status).json({ error: data });
  return res.json(data);
}

export async function iceHandler(req: Request, res: Response) {
  const apiKey = process.env.D_ID_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "D_ID_API_KEY is not set" });

  const { id } = req.params;
  const { session_id, candidate, sdpMid, sdpMLineIndex } = req.body ?? {};
  if (!id || !session_id) {
    return res.status(400).json({ error: "id, session_id required" });
  }
  const body: Record<string, any> = { session_id };
  if (candidate) {
    body.candidate = candidate;
    body.sdpMid = sdpMid;
    body.sdpMLineIndex = sdpMLineIndex;
  }
  const { ok, status, data } = await callDid(
    `${D_ID_BASE}/${encodeURIComponent(id)}/ice`,
    apiKey,
    { method: "POST", body },
    "ice"
  );
  if (!ok) return res.status(status).json({ error: data });
  return res.json(data);
}

export async function talkHandler(req: Request, res: Response) {
  const apiKey = process.env.D_ID_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "D_ID_API_KEY is not set" });

  const { id } = req.params;
  const { session_id, text, voiceId } = req.body ?? {};
  if (!id || !session_id || !text) {
    return res.status(400).json({ error: "id, session_id, text required" });
  }
  const body = {
    session_id,
    script: {
      type: "text",
      input: text,
      provider: {
        type: "elevenlabs",
        voice_id: voiceId ?? DEFAULT_VOICE_ID,
      },
    },
    config: { stitch: true, fluent: true },
  };
  const { ok, status, data } = await callDid(
    `${D_ID_BASE}/${encodeURIComponent(id)}`,
    apiKey,
    { method: "POST", body },
    "talk"
  );
  if (!ok) return res.status(status).json({ error: data });
  return res.json(data);
}

export async function closeStreamHandler(req: Request, res: Response) {
  const apiKey = process.env.D_ID_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "D_ID_API_KEY is not set" });

  const { id } = req.params;
  const { session_id } = req.body ?? {};
  if (!id || !session_id) {
    return res.status(400).json({ error: "id, session_id required" });
  }
  const { ok, status, data } = await callDid(
    `${D_ID_BASE}/${encodeURIComponent(id)}`,
    apiKey,
    { method: "DELETE", body: { session_id } },
    "close"
  );
  if (!ok) return res.status(status).json({ error: data });
  return res.json(data);
}
