import { Request, Response } from "express";
import OpenAI from "openai";

const SYSTEM_PROMPT = `You are a friendly talking-avatar assistant.
Reply in plain, conversational language — like a WhatsApp message.
Hard rules:
- Strictly between 200 and 250 characters total.
- One short paragraph, no markdown, no lists, no emojis, no links.
- Speak directly to the user. Be specific and helpful.`;

const MIN_CHARS = 200;
const MAX_CHARS = 250;

function clampToRange(text: string): string {
  let out = text.replace(/\s+/g, " ").trim();
  if (out.length > MAX_CHARS) {
    out = out.slice(0, MAX_CHARS);
    const lastSpace = out.lastIndexOf(" ");
    if (lastSpace > MIN_CHARS) out = out.slice(0, lastSpace);
    out = out.replace(/[,;:\-\s]+$/, "");
    if (!/[.!?]$/.test(out)) out += ".";
  }
  return out;
}

export async function chatHandler(req: Request, res: Response) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OPENAI_API_KEY is not set" });
  }

  const { message, history } = req.body as {
    message?: string;
    history?: { role: "user" | "assistant"; content: string }[];
  };

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "`message` is required" });
  }

  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...(history ?? []),
        { role: "user", content: message },
      ],
      temperature: 0.7,
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    const reply = clampToRange(raw);
    return res.json({ reply });
  } catch (err) {
    console.error("chat error:", err);
    const msg = err instanceof Error ? err.message : "OpenAI request failed";
    return res.status(500).json({ error: msg });
  }
}
