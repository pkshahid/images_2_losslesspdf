# Images → PDF

Convert JPEG/PNG images into a single PDF, either through a web UI or a
Telegram bot. Built with Next.js (App Router), [pdfkit](https://pdfkit.org/),
and [grammy](https://grammy.dev/).

## Features

- **Web UI**: drag-and-drop multiple images, drag to reorder, preview
  thumbnails, then download one PDF. Each image becomes a page sized to
  the image's intrinsic dimensions (no scaling/cropping).
- **Output quality**: choose High / Medium / Low to control JPEG
  re-encoding (q90 / q70 / q50) and trade file size for fidelity. PNGs
  are always embedded lossless. The resulting PDF size is shown next to
  the download link.
- **Resume.io → PDF**: paste a resume.io share link
  (`https://resume.io/r/<id>`) in the web UI or send it to the Telegram
  bot to download the resume as a PDF. Each resume page is fetched via
  resume.io's public rendering service (`ssr.resume.tools`) as a PNG and
  embedded lossless.
- **Telegram bot**: send images to the bot (as photos or files), then run
  `/convert` to get the PDF back as a document.
- Supports **JPEG** and **PNG** (pdfkit's native formats).

## Getting started

```bash
npm install
cp .env.example .env.local   # only needed for the Telegram bot
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the web UI.

## Telegram bot setup

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy the token.
2. Put it in `.env.local`:

   ```env
   TELEGRAM_BOT_TOKEN=123456:ABC...
   BOT_WEBHOOK_URL=https://your-public-domain.com
   ```

   `BOT_WEBHOOK_URL` must be a publicly reachable HTTPS URL. For local
   development use a tunnel such as [ngrok](https://ngrok.com/) or
   `cloudflared tunnel`. On Vercel, `VERCEL_URL` is used automatically
   if `BOT_WEBHOOK_URL` is not set.

3. Register the webhook once (after the app is reachable):

   ```bash
   curl https://your-public-domain.com/api/telegram/setup
   ```

   The response includes Telegram's `setWebhook` result and current
   `webhookInfo`.

### Bot usage

- Send one or more images (as photos or as document/file uploads), in the
  order you want them to appear in the PDF.
- `/convert [high|medium|low]` — build the PDF from the images collected
  so far and receive it as a document. An optional quality argument
  overrides the session's current setting for this conversion only.
- `/quality high|medium|low` — set the default output quality for this
  chat (default: `high`).
- `/clear` — discard the images collected in this chat.
- `/resume <url> [high|medium|low]` — download a resume.io share link
  (`https://resume.io/r/<id>`) as a PDF. You can also just send the link
  directly (no command needed); the bot detects resume.io URLs in plain
  text messages.
- `/help` — show usage.

### Notes & limitations

- Per-chat image state is held **in memory**. This works for a single
  server instance. For multi-instance or serverless deployments at scale,
  replace the `sessions` map in `src/lib/bot-handler.ts` with a shared
  store (e.g. Redis).
- Telegram limits downloaded files to 20 MB via `getFile`. For larger
  images, use the web UI instead.
- The webhook handler returns `200` quickly and continues processing in
  the background. On platforms that freeze the runtime after the response
  is sent (some serverless providers), long conversions may be cut short —
  in that case prefer the web UI for large batches.
- **Resume.io downloads** rely on resume.io's public rendering service
  (`ssr.resume.tools`) and only work with publicly shared resumes (the
  `/r/<id>` share link). Private resumes, or resumes whose share link has
  been revoked, will fail. The rendering service may impose its own
  rate limits or resolution caps.

## Project structure

```
src/
  app/
    api/
      convert/route.ts            # POST multipart -> PDF (web UI)
      resumeio/route.ts           # POST JSON {url} -> resume.io PDF
      telegram/webhook/route.ts   # Telegram update receiver
      telegram/setup/route.ts     # one-shot webhook registration
    layout.tsx
    page.tsx                      # web UI page
  components/
    ImageToPdf.tsx                # drag-drop + reorder + convert client UI
    ResumeIoDownloader.tsx        # resume.io URL -> PDF client UI
  lib/
    pdf.ts                        # imagesToPdf() using pdfkit
    resumeio.ts                   # resume.io share-link -> PDF
    telegram.ts                   # Telegram API helpers (sendMessage, etc.)
    bot-handler.ts                # per-chat session + update handling
```

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run start` — run the production build
- `npm run lint` — run ESLint
