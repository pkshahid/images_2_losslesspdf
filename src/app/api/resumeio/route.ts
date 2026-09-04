import {
  DEFAULT_QUALITY,
  parseQuality,
  type Quality,
} from "@/lib/pdf";
import { downloadResumeIoPdf } from "@/lib/resumeio";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST JSON `{ "url": "https://resume.io/r/<id>", "quality"?: "high"|"medium"|"low" }`
 * → returns the rendered resume as a PDF attachment.
 *
 * Also accepts the bare secureId in `url` for convenience.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { ok: false, error: "Expected JSON body with a `url` field." },
      { status: 400 },
    );
  }

  const url =
    typeof (body as { url?: unknown }).url === "string"
      ? ((body as { url: string }).url).trim()
      : "";
  if (!url) {
    return Response.json(
      { ok: false, error: "Missing `url` field." },
      { status: 400 },
    );
  }

  const qualityRaw = (body as { quality?: unknown }).quality;
  const quality: Quality =
    (typeof qualityRaw === "string" && parseQuality(qualityRaw)) ||
    DEFAULT_QUALITY;

  try {
    const { pdf, secureId, pageCount } = await downloadResumeIoPdf(
      url,
      quality,
    );
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="resume_${secureId}.pdf"`,
        "Content-Length": String(pdf.length),
        "X-Page-Count": String(pageCount),
        "X-Output-Quality": quality,
      },
    });
  } catch (err) {
    return Response.json(
      { ok: false, error: `Resume download failed: ${String(err)}` },
      { status: 502 },
    );
  }
}
