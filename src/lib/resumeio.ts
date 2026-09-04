import { imagesToPdf, type ImageInput, type Quality } from "./pdf";

/**
 * Resume.io → PDF support.
 *
 * Resume.io renders each resume page as an image via its public SSR
 * service (`ssr.resume.tools`). We fetch the page metadata to learn how
 * many pages the resume has, download each page as a PNG, and feed them
 * through the shared `imagesToPdf` pipeline so the output is identical in
 * quality/structure to the image→PDF path (web + bot).
 *
 * Share-link format: https://resume.io/r/<secureId>[?...]
 */

const RESUME_IO_URL_RE =
  /^https?:\/\/(?:www\.)?resume\.io\/r\/([A-Za-z0-9_-]+)(?:[/?#].*)?$/i;

const SECURE_ID_RE = /^[A-Za-z0-9_-]+$/;

/** Render width in pixels requested from the SSR service. */
const RENDER_SIZE = 2000;

/** Image format requested from the SSR service. PNG keeps text crisp. */
const RENDER_FORMAT = "png" as const;

const SSR_BASE = "https://ssr.resume.tools";

/** A browser-like User-Agent — the SSR service rejects empty/bot UA. */
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export type ResumeIoMetaPage = {
  viewport?: { width?: number; height?: number };
  links?: unknown[];
};

export type ResumeIoMeta = {
  pages?: ResumeIoMetaPage[];
};

/**
 * Extract the resume.io secureId from a share URL (or accept a bare id).
 * Returns null when the input is not a recognizable resume.io reference.
 */
export function parseResumeIoSecureId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const urlMatch = trimmed.match(RESUME_IO_URL_RE);
  if (urlMatch) return urlMatch[1];
  // Bare secureId (no scheme/host). Accept only if it looks like one and
  // is not, e.g., a random command.
  if (SECURE_ID_RE.test(trimmed) && trimmed.length >= 6) return trimmed;
  return null;
}

/** True if the string looks like a resume.io share URL. */
export function isResumeIoUrl(input: string): boolean {
  return RESUME_IO_URL_RE.test(input.trim());
}

/**
 * Fetch the resume metadata (page count + viewport sizes) from the SSR
 * service. Throws on non-OK responses or invalid payloads.
 */
async function fetchMeta(secureId: string): Promise<ResumeIoMeta> {
  const cache = new Date().toISOString();
  const url = `${SSR_BASE}/meta/ssid-${secureId}?cache=${encodeURIComponent(cache)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      Referer: "https://resume.io/",
    },
  });
  if (!res.ok) {
    throw new Error(
      `resume.io meta request failed: ${res.status} ${res.statusText}`,
    );
  }
  const meta = (await res.json()) as ResumeIoMeta;
  if (!meta.pages || meta.pages.length === 0) {
    throw new Error("resume.io returned no pages for this resume");
  }
  return meta;
}

/** Download one rendered page as a PNG buffer. */
async function downloadPageImage(
  secureId: string,
  pageNumber: number,
): Promise<Buffer> {
  const cache = new Date().toISOString();
  const url =
    `${SSR_BASE}/to-image/ssid-${secureId}-${pageNumber}.${RENDER_FORMAT}` +
    `?cache=${encodeURIComponent(cache)}&size=${RENDER_SIZE}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "image/png,image/*;q=0.8",
      Referer: "https://resume.io/",
    },
  });
  if (!res.ok) {
    throw new Error(
      `resume.io page ${pageNumber} download failed: ${res.status} ${res.statusText}`,
    );
  }
  const buf = Buffer.from(await res.arrayBuffer());
  // The SSR service occasionally returns a placeholder/empty body with a
  // 200; guard against a missing PNG signature.
  if (buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50) {
    throw new Error(
      `resume.io page ${pageNumber} did not return a valid PNG ` +
        `(got ${buf.length} bytes)`,
    );
  }
  return buf;
}

export type ResumeIoPdfResult = {
  pdf: Buffer;
  secureId: string;
  pageCount: number;
};

/**
 * Download a resume.io resume (by share URL or bare secureId) and render
 * it to a single PDF. Each resume page becomes one PDF page sized to the
 * rendered image's intrinsic dimensions.
 */
export async function downloadResumeIoPdf(
  input: string,
  quality: Quality = "high",
): Promise<ResumeIoPdfResult> {
  const secureId = parseResumeIoSecureId(input);
  if (!secureId) {
    throw new Error(
      "Invalid resume.io URL. Expected https://resume.io/r/<id> or a bare secureId.",
    );
  }

  const meta = await fetchMeta(secureId);
  const pageCount = meta.pages!.length;

  const images: ImageInput[] = [];
  for (let i = 1; i <= pageCount; i++) {
    const data = await downloadPageImage(secureId, i);
    images.push({
      name: `${secureId}-${i}.${RENDER_FORMAT}`,
      mime: "image/png",
      data,
    });
  }

  const pdf = await imagesToPdf(images, quality);
  return { pdf, secureId, pageCount };
}
