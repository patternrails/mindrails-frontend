"use client";
import { useCallback, type ReactNode } from "react";
import { useBackendConnection } from "@/providers/backend-connection-provider";
import { useArchiveRequest } from "@/features/settings/use-archive-request";
import { backendDownloadPath } from "@/lib/backend-download";
import type { BackendClient } from "@/lib/backend-client";
import { fileViewHref } from "@/lib/file-preview";
import { FileViewLink } from "./file-view-link";
import { FileDownloadButton } from "./file-download-button";

// Streaming Markdown can remount link renderers on every chunk. Names are immutable for these IDs;
// retain only names, scoped to a client that is replaced on backend/account changes.
const filenames = new WeakMap<BackendClient, Map<string, string>>();

/** Conversation labels may say only “download”; resolve the actual filename before offering View. */
export function FileDownloadReference({ href, filename, children }: { href: string; filename: string; children: ReactNode }) {
  const { client } = useBackendConnection();
  const download = backendDownloadPath(client?.BASE_URL, href);
  const resource = download?.replace(/\/download$/, "");
  const asset = resource?.startsWith("/api/asset-storage/versions/");
  const metadataPath = resource && fileViewHref(client?.BASE_URL, href)
    ? asset ? resource : resource.slice(0, resource.lastIndexOf("/")) : null;
  const cached = client && resource ? filenames.get(client)?.get(resource) : undefined;
  const parse = useCallback((value: unknown): string | null => {
    const data = value as { version?: { filename?: unknown } } | { id?: unknown; name?: unknown }[] | null;
    const name = Array.isArray(data) ? data.find(file => file.id === resource?.split("/").at(-1))?.name
      : data?.version?.filename;
    if (typeof name !== "string") return null;
    if (client && resource) {
      let names = filenames.get(client);
      if (!names) { names = new Map(); filenames.set(client, names); }
      names.set(resource, name);
    }
    return name;
  }, [client, resource]);
  const metadata = useArchiveRequest(cached ? null : metadataPath, parse);
  const resolved = cached ?? metadata.data;
  return <span className="file-reference"><FileDownloadButton href={href} filename={filename} className="markdown-link">{children}</FileDownloadButton>
    {resolved && <FileViewLink href={href} filename={resolved} className="markdown-link" />}</span>;
}
