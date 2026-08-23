import { getBotToken, getWebhookUrl } from "@/lib/telegram";

export const runtime = "nodejs";

/**
 * Registers the webhook with Telegram. Call this once after deploy:
 *
 *   curl https://your-domain/api/telegram/setup
 *
 * Requires TELEGRAM_BOT_TOKEN and BOT_WEBHOOK_URL (or VERCEL_URL).
 */
export async function GET() {
  const token = getBotToken();
  if (!token) {
    return Response.json(
      { ok: false, error: "TELEGRAM_BOT_TOKEN not set" },
      { status: 500 },
    );
  }
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) {
    return Response.json(
      {
        ok: false,
        error:
          "No public URL configured. Set BOT_WEBHOOK_URL (or run on Vercel).",
      },
      { status: 500 },
    );
  }

  const setRes = await fetch(
    `https://api.telegram.org/bot${token}/setWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ["message"],
        drop_pending_updates: true,
      }),
    },
  ).then((r) => r.json());

  const infoRes = await fetch(
    `https://api.telegram.org/bot${token}/getWebhookInfo`,
  ).then((r) => r.json());

  return Response.json({
    ok: true,
    webhookUrl,
    setWebhook: setRes,
    webhookInfo: infoRes,
  });
}
