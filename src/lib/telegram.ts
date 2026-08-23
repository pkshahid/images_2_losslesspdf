import { Bot } from "grammy";

/**
 * Lazily-built singleton Bot instance. Token is read from env at call time
 * so the module can be imported even when the token is not configured
 * (e.g. when only the web UI is used).
 */
let botSingleton: Bot | null = null;

export function getBot(): Bot | null {
  if (botSingleton) return botSingleton;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  botSingleton = new Bot(token);
  return botSingleton;
}

export function getBotToken(): string | undefined {
  return process.env.TELEGRAM_BOT_TOKEN;
}

/**
 * Resolve the public webhook URL the Telegram API should call.
 * Falls back to BOT_WEBHOOK_URL, then VERCEL_URL (set by Vercel).
 */
export function getWebhookUrl(path = "/api/telegram/webhook"): string | null {
  const explicit = process.env.BOT_WEBHOOK_URL;
  if (explicit) {
    const base = explicit.replace(/\/$/, "");
    return `${base}${path}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}${path}`;
  }
  return null;
}

/** Telegram Bot API helper using fetch (no extra deps). */
async function tg(method: string, body: Record<string, unknown>) {
  const token = getBotToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");
  const res = await fetch(
    `https://api.telegram.org/bot${token}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Telegram API ${method} failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function sendMessage(
  chatId: number | string,
  text: string,
): Promise<void> {
  await tg("sendMessage", { chat_id: chatId, text });
}

export async function sendDocument(
  chatId: number | string,
  data: Buffer,
  filename: string,
  caption?: string,
): Promise<void> {
  const token = getBotToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");
  const form = new FormData();
  form.append("chat_id", String(chatId));
  // Copy into a fresh Uint8Array so the Blob is backed by a regular
  // ArrayBuffer (Buffer may be backed by SharedArrayBuffer, which is not
  // accepted as a BlobPart by the TS lib types).
  const pdfBytes = new Uint8Array(data.length);
  pdfBytes.set(data);
  form.append(
    "document",
    new Blob([pdfBytes], { type: "application/pdf" }),
    filename,
  );
  if (caption) form.append("caption", caption);
  const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Telegram sendDocument failed: ${res.status} ${text}`);
  }
}

/** Download a file from Telegram by file_id. Returns the raw bytes + mime. */
export async function downloadTelegramFile(
  fileId: string,
): Promise<{ data: Buffer; mime: string }> {
  const token = getBotToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");
  const meta = await fetch(
    `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`,
  ).then((r) => r.json());
  if (!meta.ok) throw new Error(`getFile failed: ${JSON.stringify(meta)}`);
  const filePath: string = meta.result.file_path;
  const downloadUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
  const res = await fetch(downloadUrl);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const mime = res.headers.get("content-type") ?? guessMime(filePath);
  return { data: buf, mime };
}

function guessMime(path: string): string {
  const ext = path.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  return "application/octet-stream";
}
