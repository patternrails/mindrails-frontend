import { BackendClientError } from "./backend-client.ts";
import { isUuid, isTimestamp } from "./backend-sessions.ts";
import { object } from "./backend-tasks.ts";
import type { SessionDeliverable } from "./session-deliverables.ts";
export function taskDeliverableUrl(value: string) {
  const match = value.match(/^\/api\/asset-storage\/task-executions\/([^/]+)\/deliverables\/([^/]+)\/download$/);
  return !!match && isUuid(match[1]) && isUuid(match[2]);
}
export function parseTaskDeliverables(value: unknown, execution?: string): SessionDeliverable[] {
  const invalid = () => new BackendClientError("invalid-response", "Invalid Task deliverables.");
  if (!Array.isArray(value)) throw invalid();
  const seen = new Set<string>();
  return value.map(file => {
    if (!object(file) || !isUuid(file.id) || seen.has(file.id) || typeof file.name !== "string" || typeof file.path !== "string" ||
      !Number.isSafeInteger(file.bytes) || Number(file.bytes) < 0 || !isTimestamp(file.updatedAt) || typeof file.downloadUrl !== "string" || !taskDeliverableUrl(file.downloadUrl) ||
      !file.downloadUrl.endsWith(`/${file.id}/download`) || execution && !file.downloadUrl.startsWith(`/api/asset-storage/task-executions/${execution}/`)) throw invalid();
    seen.add(file.id); return file as unknown as SessionDeliverable;
  });
}
