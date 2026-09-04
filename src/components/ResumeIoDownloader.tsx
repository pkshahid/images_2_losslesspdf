"use client";

import { useState } from "react";

type Quality = "high" | "medium" | "low";

const QUALITY_OPTIONS: { value: Quality; label: string; hint: string }[] = [
  { value: "high", label: "High", hint: "JPEG q90 · largest" },
  { value: "medium", label: "Medium", hint: "JPEG q70 · balanced" },
  { value: "low", label: "Low", hint: "JPEG q50 · smallest" },
];

export default function ResumeIoDownloader() {
  const [url, setUrl] = useState("");
  const [quality, setQuality] = useState<Quality>("high");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("resume.pdf");
  const [pdfSize, setPdfSize] = useState<number | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);

  const resetResult = () => {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
    setPdfSize(null);
    setPageCount(null);
  };

  const download = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    resetResult();
    try {
      const res = await fetch("/api/resumeio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed, quality }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      const blob = await res.blob();
      setPdfSize(blob.size);
      const pages = res.headers.get("X-Page-Count");
      if (pages) setPageCount(Number(pages));
      const disp = res.headers.get("Content-Disposition") || "";
      const nameMatch = disp.match(/filename="?([^"]+)"?/i);
      setDownloadName(nameMatch ? nameMatch[1] : "resume.pdf");
      setDownloadUrl(URL.createObjectURL(blob));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="w-full max-w-4xl mx-auto px-4 py-10 sm:py-12 border-t border-zinc-200 dark:border-zinc-800">
      <header className="mb-6 text-center">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Resume.io → PDF
        </h2>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Paste a resume.io share link to download it as a PDF.
        </p>
      </header>

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="url"
          inputMode="url"
          placeholder="https://resume.io/r/your-secure-id"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) download();
          }}
          className="flex-1 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
        <button
          onClick={download}
          disabled={busy || !url.trim()}
          className="rounded-lg bg-zinc-900 dark:bg-zinc-100 px-6 py-3 text-white dark:text-zinc-900 font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition whitespace-nowrap"
        >
          {busy ? "Downloading…" : "Download PDF"}
        </button>
      </div>

      <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Output quality:
        </span>
        <div
          role="radiogroup"
          aria-label="Output quality"
          className="inline-flex rounded-lg border border-zinc-300 dark:border-zinc-700 p-0.5 self-start"
        >
          {QUALITY_OPTIONS.map((opt) => {
            const active = quality === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                title={opt.hint}
                onClick={() => setQuality(opt.value)}
                className={`px-3 py-1.5 text-sm rounded-md transition ${
                  active
                    ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-medium"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <span className="text-xs text-zinc-500 dark:text-zinc-500">
          {QUALITY_OPTIONS.find((o) => o.value === quality)?.hint}
          · pages rendered as PNG (lossless)
        </span>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {downloadUrl && (
        <div className="mt-6 flex flex-col sm:flex-row items-center gap-4">
          <a
            href={downloadUrl}
            download={downloadName}
            className="w-full sm:w-auto rounded-lg border border-zinc-300 dark:border-zinc-700 px-6 py-3 font-medium text-center hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            ⬇ Download PDF
            {pdfSize !== null && (
              <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
                ({(pdfSize / 1024).toFixed(0)} KB
                {pageCount !== null ? ` · ${pageCount} page(s)` : ""})
              </span>
            )}
          </a>
        </div>
      )}

      <p className="mt-6 text-xs text-zinc-400 dark:text-zinc-600">
        Only works with publicly shared resume.io links (the{" "}
        <code className="font-mono">/r/&lt;id&gt;</code> share URL). The
        resume is fetched via resume.io&apos;s public rendering service.
      </p>
    </section>
  );
}
