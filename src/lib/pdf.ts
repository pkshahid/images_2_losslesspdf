import PDFDocument from "pdfkit";
import sharp from "sharp";

export type ImageInput = {
  name: string;
  /** MIME type, e.g. image/jpeg, image/png */
  mime: string;
  /** Raw image bytes */
  data: Buffer | Uint8Array;
};

/** Output quality preset. PNGs are always embedded lossless; JPEGs are
 * re-encoded at the corresponding quality to reduce PDF file size. */
export type Quality = "high" | "medium" | "low";

export const QUALITY_LEVELS: Quality[] = ["high", "medium", "low"];

export const DEFAULT_QUALITY: Quality = "high";

const JPEG_QUALITY_BY_LEVEL: Record<Quality, number> = {
  high: 90,
  medium: 70,
  low: 50,
};

const SUPPORTED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
]);

/** True if the given mime type can be embedded into a PDF by pdfkit. */
export function isSupportedImageMime(mime: string): boolean {
  return SUPPORTED_MIME.has(mime.toLowerCase());
}

/** Normalize a user-provided quality string; returns null if invalid. */
export function parseQuality(value: string | null | undefined): Quality | null {
  if (!value) return null;
  const lower = value.trim().toLowerCase();
  return (QUALITY_LEVELS as string[]).includes(lower) ? (lower as Quality) : null;
}

/**
 * Convert an ordered list of images into a single PDF buffer.
 * Each image becomes one page whose size matches the image's intrinsic
 * pixel dimensions (interpreted at 72 DPI), so no scaling or cropping
 * occurs. JPEG and PNG are supported (pdfkit's native formats).
 *
 * JPEGs are re-encoded at the requested quality (via sharp) to control
 * the resulting PDF file size. PNGs are embedded lossless regardless of
 * quality, since re-encoding them to JPEG would introduce loss.
 */
export async function imagesToPdf(
  images: ImageInput[],
  quality: Quality = DEFAULT_QUALITY,
): Promise<Buffer> {
  if (images.length === 0) {
    throw new Error("No images provided");
  }

  const doc = new PDFDocument({ autoFirstPage: false, bufferPages: true });

  for (const img of images) {
    const data = Buffer.isBuffer(img.data) ? img.data : Buffer.from(img.data);
    const { data: embedData, mime } = await prepareImage(data, img.mime, quality);
    const { width, height } = measureImage(embedData, mime);
    doc.addPage({ size: [width, height] });
    doc.image(embedData, 0, 0, { width, height });
  }

  return await streamToBuffer(doc);
}

/**
 * Re-encode JPEGs at the requested quality. PNGs pass through unchanged.
 * Returns the bytes to embed along with the effective mime type.
 */
async function prepareImage(
  data: Buffer,
  mime: string,
  quality: Quality,
): Promise<{ data: Buffer; mime: string }> {
  const lower = mime.toLowerCase();
  if (lower === "image/jpeg" || lower === "image/jpg") {
    try {
      const reencoded = await sharp(data)
        .jpeg({ quality: JPEG_QUALITY_BY_LEVEL[quality], mozjpeg: true })
        .toBuffer();
      return { data: reencoded, mime: "image/jpeg" };
    } catch {
      // If re-encoding fails (corrupt input), fall back to the original.
      return { data, mime: lower };
    }
  }
  // PNG (or anything else we accept): embed as-is.
  return { data, mime: lower === "image/jpg" ? "image/jpeg" : lower };
}

/** Best-effort measurement of an image's pixel dimensions. */
function measureImage(
  data: Buffer,
  mime: string,
): { width: number; height: number } {
  const lower = mime.toLowerCase();
  try {
    if (lower === "image/png") return measurePng(data);
    if (lower === "image/jpeg" || lower === "image/jpg") {
      return measureJpeg(data);
    }
  } catch {
    // fall through to default
  }
  // Default to A4 in points (595 x 842) when we can't probe.
  return { width: 595, height: 842 };
}

/** Read width/height from a PNG IHDR chunk. */
function measurePng(data: Buffer): { width: number; height: number } {
  // PNG signature is 8 bytes; IHDR starts at offset 8.
  // Width: bytes 16-19, Height: bytes 20-23 (big-endian uint32).
  if (data.length < 24) throw new Error("PNG too short");
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
  };
}

/** Read width/height from a JPEG by scanning its SOFn markers. */
function measureJpeg(data: Buffer): { width: number; height: number } {
  let offset = 2; // skip SOI marker (0xFFD8)
  while (offset + 8 < data.length) {
    if (data[offset] !== 0xff) throw new Error("Invalid JPEG marker");
    const marker = data[offset + 1];
    // SOFn markers (0xC0-0xCF, excluding 0xC4/0xC8) carry frame info.
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8
    ) {
      return {
        height: data.readUInt16BE(offset + 5),
        width: data.readUInt16BE(offset + 7),
      };
    }
    const len = data.readUInt16BE(offset + 2);
    offset += 2 + len;
  }
  throw new Error("JPEG SOF not found");
}

function streamToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}
