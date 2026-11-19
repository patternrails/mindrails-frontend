import { BackendClientError } from "./backend-client.ts";
import { parseProviderTest } from "./provider-management.ts";

export const quickSetupPath = "api/provider-quick-setup";
export const quickSetupKinds = ["language", "embedding", "image", "webSearch"] as const;
export type QuickSetupKind = typeof quickSetupKinds[number];
export type QuickSetupDraft = { type: string; endpoint: string; apiKey: string; model: string };
export type VerifiedProvider = { draft: QuickSetupDraft; receipt: string };

export function quickSetupSessionKey(clientScope: string) {
  return `mindrails.quick-setup.auto:${clientScope}`;
}

const invalid = () => new BackendClientError("invalid-response", "Invalid quick setup response.");

export function parseQuickSetupStatus(value: unknown) {
  if (!value || typeof value !== "object" || !("empty" in value) || !("hasEmbedding" in value)
      || typeof value.empty !== "boolean" || typeof value.hasEmbedding !== "boolean"
      || (value.empty && value.hasEmbedding)) throw invalid();
  return { empty: value.empty, hasEmbedding: value.hasEmbedding };
}

export function parseQuickSetupTest(value: unknown) {
  const result = parseProviderTest(value);
  const { model, needsModel, models, receipt } = value as Record<string, unknown>;
  if (typeof needsModel !== "boolean" || !Array.isArray(models) || !models.every(item => typeof item === "string")
      || !(model === null || typeof model === "string") || !(receipt === null || typeof receipt === "string")
      || (result.connected && (!receipt || needsModel))) throw invalid();
  return { ...result, model, needsModel, models: models as string[], receipt };
}
