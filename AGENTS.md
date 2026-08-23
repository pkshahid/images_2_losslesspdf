<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project: Images → PDF

Next.js 16 (App Router) + TypeScript + Tailwind v4. Converts JPEG/PNG
images to a single PDF via a web UI and a Telegram bot (webhook).

### Commands

- `npm run dev` — dev server (http://localhost:3000)
- `npm run build` — production build (run before considering work done)
- `npm run start` — run production build
- `npm run lint` — ESLint

### Key libraries

- `pdfkit` — PDF generation (Node runtime only; route handlers use
  `export const runtime = "nodejs"`).
- `sharp` — native image processing; re-encodes JPEGs at the requested
  quality (q90/q70/q50) before embedding. PNGs pass through lossless.
  Also a native addon, so it's listed in `serverExternalPackages`.
- `grammy` — Telegram bot client (only used for the Bot singleton; raw
  Telegram HTTP API is called via `fetch` in `src/lib/telegram.ts`).
- `react-dropzone` + `@dnd-kit/*` — drag-drop upload & reorder in the UI.

### Env vars

- `TELEGRAM_BOT_TOKEN` — required for the bot; optional for web-only use.
- `BOT_WEBHOOK_URL` — public HTTPS base URL for the webhook. On Vercel,
  `VERCEL_URL` is used as a fallback.

### Conventions

- PDF route handlers live under `src/app/api/**/route.ts` and must export
  `runtime = "nodejs"` (pdfkit/sharp need Node streams/Buffer).
- Image→PDF logic is centralized in `src/lib/pdf.ts` so the web and bot
  paths share one implementation, including the `Quality` preset.
- Quality (`high` | `medium` | `low`) re-encodes JPEGs via sharp; PNGs
  are always embedded lossless. `parseQuality()` validates input.
- Per-chat bot state is in-memory (`src/lib/bot-handler.ts`); swap for a
  shared store if scaling horizontally.
