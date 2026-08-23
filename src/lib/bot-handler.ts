import {
  DEFAULT_QUALITY,
  imagesToPdf,
  isSupportedImageMime,
  parseQuality,
  type ImageInput,
  type Quality,
} from "./pdf";
import {
  downloadTelegramFile,
  sendMessage,
  sendDocument,
} from "./telegram";

/**
 * Per-chat session state. In-memory only — fine for a single-instance
 * deployment. For multi-instance / serverless at scale, swap this for
 * Redis or another shared store.
 */
type Session = {
  images: ImageInput[];
  quality: Quality;
  lastActivity: number;
};

const sessions = new Map<number, Session>();

// Expire idle sessions after 30 minutes.
const SESSION_TTL_MS = 30 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [chatId, s] of sessions) {
    if (now - s.lastActivity > SESSION_TTL_MS) sessions.delete(chatId);
  }
}, 5 * 60 * 1000);

function getSession(chatId: number): Session {
  let s = sessions.get(chatId);
  if (!s) {
    s = { images: [], quality: DEFAULT_QUALITY, lastActivity: Date.now() };
    sessions.set(chatId, s);
  }
  s.lastActivity = Date.now();
  return s;
}

const HELP_TEXT = [
  "🖼️ *Images to PDF Bot*",
  "",
  "Send me one or more photos (as *photo* or as a *document/file*), in the order you want them to appear.",
  "",
  "Commands:",
  "/convert \\[high|medium|low] — build the PDF from the images sent so far",
  "/quality high|medium|low — set output quality (default: high)",
  "/clear — discard the images collected in this chat",
  "/help — show this help",
  "",
  "Quality controls JPEG re-encoding (q90/q70/q50) to trade file size for fidelity. PNGs are always embedded lossless.",
].join("\n");

export async function handleTelegramUpdate(update: {
  message?: {
    chat: { id: number };
    from?: { first_name?: string };
    text?: string;
    photo?: { file_id: string }[];
    document?: { file_id: string; file_name?: string; mime_type?: string };
    caption?: string;
  };
}): Promise<void> {
  const msg = update.message;
  if (!msg) return;
  const chatId = msg.chat.id;

  // /start and /help
  if (msg.text && /^\/(start|help)(\s|$)/i.test(msg.text)) {
    await sendMessage(chatId, HELP_TEXT);
    return;
  }

  // /clear
  if (msg.text && /^\/clear(\s|$)/i.test(msg.text)) {
    sessions.delete(chatId);
    await sendMessage(chatId, "🧹 Cleared. Send me new images to start over.");
    return;
  }

  // /quality <level>
  if (msg.text && /^\/quality(\s|$)/i.test(msg.text)) {
    const arg = msg.text.split(/\s+/)[1];
    const parsed = parseQuality(arg ?? null);
    if (!parsed) {
      const current = getSession(chatId).quality;
      await sendMessage(
        chatId,
        `Usage: /quality high|medium|low\nCurrent quality: ${current}`,
      );
      return;
    }
    getSession(chatId).quality = parsed;
    await sendMessage(chatId, `✅ Output quality set to *${parsed}*.`);
    return;
  }

  // /convert [level]
  if (msg.text && /^\/convert(\s|$)/i.test(msg.text)) {
    const arg = msg.text.split(/\s+/)[1];
    const override = parseQuality(arg ?? null);
    if (arg && !override) {
      await sendMessage(
        chatId,
        "Usage: /convert [high|medium|low]\nExample: /convert medium",
      );
      return;
    }
    await convertAndSend(chatId, override ?? undefined);
    return;
  }

  // Photo (Telegram sends multiple sizes; pick the largest = last).
  if (msg.photo && msg.photo.length > 0) {
    const largest = msg.photo[msg.photo.length - 1];
    try {
      const { data, mime } = await downloadTelegramFile(largest.file_id);
      const session = getSession(chatId);
      session.images.push({
        name: `photo_${session.images.length + 1}.jpg`,
        mime,
        data,
      });
      await sendMessage(
        chatId,
        `✅ Added image #${session.images.length}. Send more, or use /convert to build the PDF.`,
      );
    } catch (err) {
      await sendMessage(chatId, `⚠️ Failed to download image: ${String(err)}`);
    }
    return;
  }

  // Document (file). Accept only supported image types.
  if (msg.document) {
    const mime = msg.document.mime_type ?? "";
    if (!isSupportedImageMime(mime)) {
      await sendMessage(
        chatId,
        `⚠️ Only JPEG and PNG images are supported (got "${mime || "unknown"}").`,
      );
      return;
    }
    try {
      const { data } = await downloadTelegramFile(msg.document.file_id);
      const session = getSession(chatId);
      session.images.push({
        name: msg.document.file_name ?? `file_${session.images.length + 1}`,
        mime,
        data,
      });
      await sendMessage(
        chatId,
        `✅ Added image #${session.images.length}. Send more, or use /convert to build the PDF.`,
      );
    } catch (err) {
      await sendMessage(chatId, `⚠️ Failed to download file: ${String(err)}`);
    }
    return;
  }

  // Anything else
  await sendMessage(
    chatId,
    "Send me images (as photos or files), then /convert to build a PDF. /help for usage.",
  );
}

async function convertAndSend(
  chatId: number,
  qualityOverride?: Quality,
): Promise<void> {
  const session = sessions.get(chatId);
  if (!session || session.images.length === 0) {
    await sendMessage(chatId, "No images yet. Send me some images first.");
    return;
  }
  const count = session.images.length;
  const quality = qualityOverride ?? session.quality;
  await sendMessage(
    chatId,
    `⏳ Converting ${count} image(s) to PDF (quality: ${quality})…`,
  );
  try {
    const pdf = await imagesToPdf(session.images, quality);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const sizeKb = (pdf.length / 1024).toFixed(0);
    await sendDocument(
      chatId,
      pdf,
      `images_${stamp}.pdf`,
      `PDF · ${count} page(s) · ${quality} quality · ${sizeKb} KB`,
    );
    sessions.delete(chatId);
  } catch (err) {
    await sendMessage(chatId, `⚠️ Conversion failed: ${String(err)}`);
  }
}
