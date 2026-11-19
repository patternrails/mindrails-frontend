import { taskDeliverableUrl } from "./task-deliverables.ts";
import { BackendClientError } from "./backend-client.ts";
import { isUuid } from "./backend-sessions.ts";
import { backendEndpoint } from "./backend-url.ts";

export type SessionDeliverable = { id: string; name: string; path: string; bytes: number; updatedAt: string; downloadUrl: string;
  assetId?: string; versionId?: string; mediaType?: string; requestId?: string };
export function deliverableUrl(value: string) {
  const match = value.match(/^\/api\/asset-storage\/sessions\/([^/]+)\/deliverables\/([^/]+)\/download$/);
  return !!match && isUuid(match[1]) && isUuid(match[2]);
}
export function parseSessionDeliverables(value: unknown, sessionId?: string): SessionDeliverable[] {
  const invalid = () => new BackendClientError("invalid-response", "Invalid session deliverables.");
  if (!Array.isArray(value)) throw invalid();
  const seen = new Set<string>();
  return value.map(file => {
    if (!file || typeof file !== "object" || !isUuid(file.id) || seen.has(file.id) || typeof file.name !== "string" || !file.name.trim() ||
      typeof file.path !== "string" || !file.path || typeof file.bytes !== "number" || !Number.isSafeInteger(file.bytes) || file.bytes < 0 ||
      typeof file.updatedAt !== "string" || !Number.isFinite(Date.parse(file.updatedAt)) || typeof file.downloadUrl !== "string" ||
      !deliverableUrl(file.downloadUrl) || !file.downloadUrl.endsWith(`/${file.id}/download`) ||
      sessionId && !file.downloadUrl.startsWith(`/api/asset-storage/sessions/${sessionId}/`)) throw invalid();
    seen.add(file.id);
    const image = file.assetId != null || file.versionId != null || file.mediaType != null;
    if (image && (!isUuid(file.assetId) || !isUuid(file.versionId) || !["image/png", "image/jpeg", "image/webp"].includes(file.mediaType))) throw invalid();
    if (file.requestId != null && !isUuid(file.requestId)) throw invalid();
    return { id: file.id, name: file.name, path: file.path, bytes: file.bytes, updatedAt: file.updatedAt, downloadUrl: file.downloadUrl,
      ...(image ? { assetId: file.assetId, versionId: file.versionId, mediaType: file.mediaType } : {}),
      ...(file.requestId ? { requestId: file.requestId } : {}) };
  });
}
export function outputHref(baseUrl: string | undefined, href: string | undefined) {
  return href && baseUrl && (deliverableUrl(href) || taskDeliverableUrl(href)) ? backendEndpoint(baseUrl, href) : href;
}
