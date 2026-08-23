import {
  DEFAULT_QUALITY,
  imagesToPdf,
  isSupportedImageMime,
  parseQuality,
  type ImageInput,
  type Quality,
} from "@/lib/pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST multipart/form-data with one or more `images` file fields, in the
 * order they should appear in the PDF, and an optional `quality` field
 * ("high" | "medium" | "low", default "high"). Returns the PDF file.
 */
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json(
      { ok: false, error: "Expected multipart/form-data with an `images` field." },
      { status: 400 },
    );
  }
  const files = form.getAll("images").filter(
    (f): f is File => f instanceof File,
  );

  if (files.length === 0) {
    return Response.json(
      { ok: false, error: "No images provided" },
      { status: 400 },
    );
  }

  const qualityRaw = form.get("quality");
  const quality: Quality =
    (typeof qualityRaw === "string" && parseQuality(qualityRaw)) ||
    DEFAULT_QUALITY;

  const images: ImageInput[] = [];
  for (const file of files) {
    if (!isSupportedImageMime(file.type) && !isSupportedByExtension(file.name)) {
      return Response.json(
        {
          ok: false,
          error: `Unsupported file type: ${file.name} (${file.type || "unknown"}). Only JPEG and PNG are supported.`,
        },
        { status: 400 },
      );
    }
    const buf = Buffer.from(await file.arrayBuffer());
    images.push({ name: file.name, mime: file.type || "image/jpeg", data: buf });
  }

  try {
    const pdf = await imagesToPdf(images, quality);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="images_${stamp}.pdf"`,
        "Content-Length": String(pdf.length),
        "X-Output-Quality": quality,
      },
    });
  } catch (err) {
    return Response.json(
      { ok: false, error: `Conversion failed: ${String(err)}` },
      { status: 500 },
    );
  }
}

function isSupportedByExtension(name: string): boolean {
  return /\.(jpe?g|png)$/i.test(name);
}
