import ImageToPdf from "@/components/ImageToPdf";
import ResumeIoDownloader from "@/components/ResumeIoDownloader";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center bg-zinc-50 dark:bg-black">
      <ImageToPdf />
      <ResumeIoDownloader />
    </main>
  );
}
