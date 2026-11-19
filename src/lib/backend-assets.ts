import { downloadBackendFile } from "./backend-download.ts";
import { isSourceUrl } from "./source-urls.ts";
export { isSourceUrl } from "./source-urls.ts";
import { BackendClient, BackendClientError } from "./backend-client.ts";
import { isUuid } from "./backend-sessions.ts";

export type AssetVersion = { id: string; assetId: string; extractionId: string; number: number; filename: string; mediaType: string; md5?: string | null; bytes: number; state: string; error: string | null; textChars: number; createdAt: string };
export type AssetView = { asset: { id: string; title: string; kind: string; createdAt: string }; version: AssetVersion; inKnowledgeBase: boolean; knowledgeBaseId: string | null; knowledgeState: string | null; knowledgeError?: string | null; versions: AssetVersion[] };
const invalid = () => new BackendClientError("invalid-response", "Invalid asset response.");
export function parseAsset(value: unknown): AssetView {
  if (!value || typeof value !== "object") throw invalid();
  const v = value as AssetView;
  if (v.knowledgeError !== undefined && v.knowledgeError !== null && typeof v.knowledgeError !== "string") throw invalid();
  if (!v.asset || !isUuid(v.asset.id) || typeof v.asset.title !== "string" || !v.version || !isUuid(v.version.id) || !isUuid(v.version.extractionId) || v.version.assetId !== v.asset.id || typeof v.version.filename !== "string" || typeof v.version.bytes !== "number" || typeof v.version.state !== "string" || !Array.isArray(v.versions) || typeof v.inKnowledgeBase !== "boolean" || !(v.knowledgeBaseId === null || isUuid(v.knowledgeBaseId)) || !(v.knowledgeState === null || typeof v.knowledgeState === "string")) throw invalid();
  return v;
}
export function parseAssetList(value: unknown): AssetView[] { if (!Array.isArray(value)) throw invalid(); return value.map(parseAsset); }
export const assetReady = (asset: AssetView) => asset.version.state === "READY" && (asset.knowledgeState === null || asset.knowledgeState === "READY");
export const assetFailed = (asset: AssetView) => asset.version.state === "FAILED" || asset.knowledgeState === "FAILED" || asset.knowledgeState === "UNAVAILABLE";
export function assetFailureReason(asset: AssetView) {
  return asset.version.state === "FAILED" ? asset.version.error || "File parsing failed without an error message." : asset.knowledgeError || asset.version.error || "Knowledge indexing failed without an error message.";
}
export function assetErrorMessage(cause: unknown) {
  return cause instanceof Error && cause.message.trim() ? cause.message : typeof cause === "string" && cause.trim() ? cause : "Unexpected error without details. Check the backend logs and retry.";
}
export async function uploadAsset(client: BackendClient, file: File, signal: AbortSignal, onProgress: (fraction: number) => void, kind = "FILE") {
  const body = new FormData(); body.set("file", file); body.set("kind", kind);
  return parseAsset(await client.upload("api/asset-storage", body, { signal, onProgress }));
}
export async function downloadAsset(client: BackendClient, version: string, filename: string, signal: AbortSignal) {
  if (!isUuid(version)) throw invalid();
  await downloadSource(client, `/api/asset-storage/versions/${version}/download`, filename, signal);
}
export async function downloadSource(client: BackendClient, path: string, filename: string, signal: AbortSignal) {
  if (!isSourceUrl(path) || !path.endsWith("/download")) throw invalid();
  await downloadBackendFile(client, path, filename, signal);
}

/** The API orders Session attachments by attachment time, newest first. */
export function parseSessionAttachments(value: unknown): AssetVersion[] {
  if (!Array.isArray(value)) throw invalid();
  const seen = new Set<string>();
  return value.map(item => {
    if (!item || typeof item !== "object" || !isUuid(item.id) || seen.has(item.id)
      || !isUuid(item.assetId) || !isUuid(item.extractionId) || typeof item.filename !== "string"
      || !Number.isSafeInteger(item.bytes) || item.bytes < 0 || !Number.isSafeInteger(item.number) || item.number < 1
      || typeof item.createdAt !== "string" || !Number.isFinite(Date.parse(item.createdAt))) throw invalid();
    seen.add(item.id);
    return item as AssetVersion;
  });
}
