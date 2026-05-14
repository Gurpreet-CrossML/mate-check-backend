import { Request, Response } from "express";
import OpenAI from "openai";

// OpenAI TTS returns raw 16-bit signed PCM at 24kHz mono when
// response_format=pcm. We compute the amplitude envelope from those
// samples and wrap them in a WAV header so the mobile client can play
// the buffer directly with expo-audio.
const SAMPLE_RATE = 24000;
const ENVELOPE_WINDOW_MS = 40; // ~25 fps, matches the avatar render loop

type TtsBody = {
  text?: string;
  voice?: string;
};

export async function ttsHandler(req: Request, res: Response) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "OPENAI_API_KEY is not set" });
  }

  const { text, voice } = (req.body ?? {}) as TtsBody;
  if (!text || typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "`text` is required" });
  }

  try {
    const client = new OpenAI({ apiKey });
    const model = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
    const audioRes = await client.audio.speech.create({
      model,
      voice: (voice || process.env.OPENAI_TTS_VOICE || "alloy") as any,
      input: text,
      response_format: "pcm",
    });

    const pcm = Buffer.from(await audioRes.arrayBuffer());
    const wav = pcmToWav(pcm, SAMPLE_RATE);
    const envelope = computeEnvelope(pcm, SAMPLE_RATE, ENVELOPE_WINDOW_MS);

    return res.json({
      audio: wav.toString("base64"),
      mime: "audio/wav",
      sampleRate: SAMPLE_RATE,
      durationMs: Math.round((pcm.length / 2 / SAMPLE_RATE) * 1000),
      envelope,
      envelopeWindowMs: ENVELOPE_WINDOW_MS,
    });
  } catch (err) {
    console.error("tts error:", err);
    const msg = err instanceof Error ? err.message : "TTS request failed";
    return res.status(500).json({ error: msg });
  }
}

function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcm.length;

  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // PCM fmt chunk size
  header.writeUInt16LE(1, 20); // audio format = PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcm]);
}

function computeEnvelope(pcm: Buffer, sampleRate: number, windowMs: number): number[] {
  // RMS over fixed-size windows, normalized so a moderate-volume voice
  // sits around 0.4-0.6 (leaving headroom for emphasis).
  const samplesPerWindow = Math.max(1, Math.floor((sampleRate * windowMs) / 1000));
  const totalSamples = pcm.length / 2;
  const envelope: number[] = [];

  for (let i = 0; i < totalSamples; i += samplesPerWindow) {
    let sumSquares = 0;
    let count = 0;
    const end = Math.min(i + samplesPerWindow, totalSamples);
    for (let j = i; j < end; j++) {
      const sample = pcm.readInt16LE(j * 2);
      sumSquares += sample * sample;
      count++;
    }
    const rms = Math.sqrt(sumSquares / count);
    // 8000 chosen empirically — bumps quiet syllables up while keeping
    // loud ones below 1. Tune if mouth motion looks too flat / too wild.
    envelope.push(Math.min(1, rms / 8000));
  }
  return envelope;
}
