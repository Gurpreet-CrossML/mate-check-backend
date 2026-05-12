# mate-check-api

Express + TypeScript backend for the mate-check mobile app. Deploys to Vercel.

## Endpoints

- `POST /api/chat` — `{ message, history? }` → `{ reply }` (200–250 chars, GPT-4.1-mini)
- `POST /api/clip` — `{ text, presenterId?, voiceId?, bgColor? }` → `{ id, videoUrl, status }`
- `GET /api/health` — `{ ok: true }`

## Local dev

```
cp .env.example .env
# fill OPENAI_API_KEY and D_ID_API_KEY
npm install
npm run dev
# → http://localhost:4000
```

## Deploy to Vercel

Push this folder as its own repo (or as a project root in a monorepo) and import
it into Vercel. Set `OPENAI_API_KEY` and `D_ID_API_KEY` in the Vercel project
environment. `vercel.json` routes everything to the Express app in `api/index.ts`.

## Notes

- The D-ID key must be the **base64-encoded** form expected by their Basic
  auth header (same format as the Next.js POC).
- `D_ID_PRESENTER_ID` defaults to `v2_public_alex@qcvo4gupoy`. Override via env
  if you want a different avatar.
