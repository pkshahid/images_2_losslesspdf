"use client";

import { useCallback, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type ImageItem = {
  id: string;
  file: File;
  url: string;
};

type Quality = "high" | "medium" | "low";

const QUALITY_OPTIONS: { value: Quality; label: string; hint: string }[] = [
  { value: "high", label: "High", hint: "JPEG q90 · largest" },
  { value: "medium", label: "Medium", hint: "JPEG q70 · balanced" },
  { value: "low", label: "Low", hint: "JPEG q50 · smallest" },
];

const ACCEPTED = { "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"] };

export default function ImageToPdf() {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>("images.pdf");
  const [quality, setQuality] = useState<Quality>("high");
  const [pdfSize, setPdfSize] = useState<number | null>(null);

  const onDrop = useCallback((accepted: File[]) => {
    setError(null);
    setDownloadUrl(null);
    setPdfSize(null);
    const next = accepted.map((file) => ({
      id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      url: URL.createObjectURL(file),
    }));
    setItems((prev) => [...prev, ...next]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED,
    multiple: true,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (over && active.id !== over.id) {
      setItems((prev) => {
        const oldIndex = prev.findIndex((i) => i.id === active.id);
        const newIndex = prev.findIndex((i) => i.id === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const found = prev.find((i) => i.id === id);
      if (found) URL.revokeObjectURL(found.url);
      return prev.filter((i) => i.id !== id);
    });
  };

  const clearAll = () => {
    items.forEach((i) => URL.revokeObjectURL(i.url));
    setItems([]);
    setDownloadUrl(null);
    setPdfSize(null);
    setError(null);
  };

  const totalSize = useMemo(
    () => items.reduce((sum, i) => sum + i.file.size, 0),
    [items],
  );

  const convert = async () => {
    if (items.length === 0) return;
    setBusy(true);
    setError(null);
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }
    try {
      const fd = new FormData();
      // Append in the current order so the PDF page order matches.
      for (const item of items) fd.append("images", item.file, item.file.name);
      fd.append("quality", quality);
      const res = await fetch("/api/convert", { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      const blob = await res.blob();
      setPdfSize(blob.size);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      setDownloadName(`images_${stamp}.pdf`);
      setDownloadUrl(URL.createObjectURL(blob));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-10 sm:py-16">
      <header className="mb-8 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Images → PDF
        </h1>
        <p className="mt-3 text-zinc-600 dark:text-zinc-400">
          Drop JPEG/PNG images, drag to reorder, then download a single PDF.
        </p>
      </header>

      <div
        {...getRootProps()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
          isDragActive
            ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
            : "border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600"
        }`}
      >
        <input {...getInputProps()} />
        <p className="text-base text-zinc-700 dark:text-zinc-300">
          {isDragActive
            ? "Drop the images here…"
            : "Drag & drop images here, or click to select"}
        </p>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">
          JPEG and PNG · multiple files allowed
        </p>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {items.length > 0 && (
        <>
          <div className="mt-6 flex items-center justify-between">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {items.length} image{items.length === 1 ? "" : "s"} ·{" "}
              {(totalSize / 1024 / 1024).toFixed(2)} MB · drag to reorder
            </p>
            <button
              onClick={clearAll}
              className="text-sm text-zinc-500 hover:text-red-600 dark:hover:text-red-400"
            >
              Clear all
            </button>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={items.map((i) => i.id)}
              strategy={rectSortingStrategy}
            >
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {items.map((item, idx) => (
                  <SortableImage
                    key={item.id}
                    item={item}
                    index={idx}
                    onRemove={() => removeItem(item.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <div className="mt-8 flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
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
                · PNGs always lossless
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4">
              <button
                onClick={convert}
                disabled={busy || items.length === 0}
                className="w-full sm:w-auto rounded-lg bg-zinc-900 dark:bg-zinc-100 px-6 py-3 text-white dark:text-zinc-900 font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition"
              >
                {busy ? "Converting…" : `Convert ${items.length} image${items.length === 1 ? "" : "s"} to PDF`}
              </button>

              {downloadUrl && (
                <a
                  href={downloadUrl}
                  download={downloadName}
                  className="w-full sm:w-auto rounded-lg border border-zinc-300 dark:border-zinc-700 px-6 py-3 font-medium text-center hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                >
                  ⬇ Download PDF
                  {pdfSize !== null && (
                    <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">
                      ({(pdfSize / 1024).toFixed(0)} KB)
                    </span>
                  )}
                </a>
              )}
            </div>
          </div>
        </>
      )}

      <footer className="mt-16 text-center text-xs text-zinc-400 dark:text-zinc-600">
        Also available as a Telegram bot — see the README to set it up.
      </footer>
    </div>
  );
}

function SortableImage({
  item,
  index,
  onRemove,
}: {
  item: ImageItem;
  index: number;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative aspect-square rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 touch-none"
    >
      <div
        {...attributes}
        {...listeners}
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.url}
          alt={item.file.name}
          className="h-full w-full object-cover pointer-events-none"
          draggable={false}
        />
      </div>
      <span className="absolute top-1 left-1 rounded bg-black/60 text-white text-xs px-1.5 py-0.5">
        {index + 1}
      </span>
      <button
        onClick={onRemove}
        aria-label="Remove image"
        className="absolute top-1 right-1 rounded bg-black/60 text-white text-xs w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
      >
        ×
      </button>
      <span className="absolute bottom-0 inset-x-0 truncate bg-black/60 text-white text-[10px] px-1.5 py-0.5">
        {item.file.name}
      </span>
    </div>
  );
}
