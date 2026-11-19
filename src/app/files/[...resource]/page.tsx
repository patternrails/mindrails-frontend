import { notFound } from "next/navigation";
import { fileResource } from "@/lib/file-preview";
import { FileViewer } from "@/features/files/file-viewer";

export default async function FilePage({ params }: { params: Promise<{ resource: string[] }> }) {
  const { resource } = await params;
  const path = fileResource(resource);
  if (!path) notFound();
  return <FileViewer path={path} />;
}
