import { BackendClient, BackendClientError } from "./backend-client.ts";
import { normalizeBackendUrl } from "./backend-url.ts";
import { downloadFilename } from "./download-filename.ts";
import { deliverableUrl } from "./session-deliverables.ts";
import { isSourceUrl } from "./source-urls.ts";
import { taskDeliverableUrl } from "./task-deliverables.ts";

export function isBackendDownloadPath(path: string) {
  return path.endsWith("/download") && (isSourceUrl(path) || deliverableUrl(path) || taskDeliverableUrl(path));
}

/** Absolute links must belong to the configured backend, including its deployment prefix. */
export function backendDownloadPath(base: string | undefined, href: string | undefined): string | undefined {
  if (!href) return undefined;
  if (isBackendDownloadPath(href)) return href;
  if (!base) return undefined;
  const prefix = normalizeBackendUrl(base);
  if (!href.startsWith(prefix)) return undefined;
  const path = `/${href.slice(prefix.length)}`;
  return isBackendDownloadPath(path) ? path : undefined;
}

/** Fetch with the normal Bearer/refresh flow before handing a local blob to the browser. */
export async function downloadBackendFile(client: BackendClient, path: string, filename: string, signal: AbortSignal) {
  if (!isBackendDownloadPath(path)) throw new BackendClientError("invalid-request", "Invalid backend download path.");
  const result = await client.request<{ blob: Blob; disposition: string | null }>(path, {
    signal, responseType: "download", timeoutMs: 60000, reportTimeout: false,
  });
  if (!(result?.blob instanceof Blob) || signal.aborted) return;
  const href = URL.createObjectURL(result.blob), link = document.createElement("a");
  try {
    link.href = href; link.download = downloadFilename(result.disposition, filename);
    document.body.append(link); link.click();
  } finally {
    link.remove(); setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
}
