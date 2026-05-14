import { Request, Response } from "express";
import OpenAI from "openai";

const SYSTEM_PROMPT = `You are MateCheck — a friendly talking-avatar mate.
Reply in plain, conversational language, like a WhatsApp message to a friend.
- One short paragraph. No markdown, no lists, no emojis, no links.
- Keep it brief: 1–3 sentences, ideally under ~60 words.
- Speak directly to the user. Be specific, warm, and helpful.`;

type ChatBody = {
  message?: string;
  history?: { role: "user" | "assistant"; content: string }[];
  stream?: boolean;
};

export async function chatHandler(req: Request, res: Response) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OPENAI_API_KEY is not set" });
  }

  const { message, history, stream } = req.body as ChatBody;

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "`message` is required" });
  }

  const client = new OpenAI({ apiKey });
  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    ...(history ?? []),
    { role: "user" as const, content: message },
  ];

  // Default to streaming. Legacy callers can pass { stream: false } for a JSON reply.
  if (stream === false) {
    try {
      const completion = await client.chat.completions.create({
        model: "gpt-4.1-nano",
        messages,
        temperature: 0.7,
      });
      const reply = (completion.choices[0]?.message?.content ?? "").trim();
      return res.json({ reply });
    } catch (err) {
      console.error("chat error:", err);
      const msg = err instanceof Error ? err.message : "OpenAI request failed";
      return res.status(500).json({ error: msg });
    }
  }

  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-nano",
      messages,
      temperature: 0.7,
      stream: true,
    });

    for await (const chunk of completion) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        res.write(JSON.stringify({ type: "delta", content: delta }) + "\n");
      }
    }
    res.write(JSON.stringify({ type: "done" }) + "\n");
    res.end();
  } catch (err) {
    console.error("chat stream error:", err);
    const msg = err instanceof Error ? err.message : "OpenAI request failed";
    if (!res.headersSent) {
      res.status(500).json({ error: msg });
      return;
    }
    res.write(JSON.stringify({ type: "error", error: msg }) + "\n");
    res.end();
  }
}
