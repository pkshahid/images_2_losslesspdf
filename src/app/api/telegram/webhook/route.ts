import { handleTelegramUpdate } from "@/lib/bot-handler";
import { getBotToken } from "@/lib/telegram";

// pdfkit and grammy need the Node.js runtime.
export const runtime = "nodejs";
// Telegram expects a 200 within a few seconds; allow up to 60s for downloads.
export const maxDuration = 60;

/**
 * Telegram webhook receiver.
 *
 * Telegram POSTs an Update to this endpoint. We acknowledge immediately
 * with 200 and process the update in the same request. If the bot token
 * is not configured we still return 200 so Telegram doesn't retry spam.
 */
export async function POST(req: Request) {
  if (!getBotToken()) {
    return Response.json({ ok: false, error: "bot not configured" }, {
      status: 200,
    });
  }

  let update: unknown;
  try {
    update = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  // Process in the background so we can return 200 quickly. On serverless
  // platforms the function may be frozen after response, so we still attempt
  // to await within the request as a fallback (see below).
  const work = handleTelegramUpdate(update as never).catch((err) => {
    console.error("[telegram] update handler error:", err);
  });

  // Wait briefly so most simple replies (text) complete before we return.
  // Heavy downloads/conversions may continue past this; on platforms that
  // support background tasks (e.g. Vercel `waitUntil`) this is fine.
  await Promise.race([
    work,
    new Promise((resolve) => setTimeout(resolve, 2500)),
  ]);

  return Response.json({ ok: true });
}

/** Simple health check. */
export async function GET() {
  return Response.json({
    ok: true,
    configured: Boolean(getBotToken()),
  });
}
