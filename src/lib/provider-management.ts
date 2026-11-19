import { BackendClientError } from "./backend-client.ts";
import { parseProviderPage, type ModelProvider } from "./backend-providers.ts";
export type LanguageProvider = ModelProvider & { integrationMode: string; hasApiKey: boolean };
export type EmbeddingProvider = { defaultProvider: boolean; name: string; type: string; modelName: string; baseUrl: string; hasApiKey: boolean; dimensions: number; timeoutMillis: number | null; maxRetries: number | null };
const invalid = () => new BackendClientError("invalid-response", "Invalid provider configuration.");
export function parseLanguageProviders(value: unknown): LanguageProvider[] {
  const models = parseProviderPage(value);
  return models.map((p, index) => {
    const source = (value as Record<string, unknown>[])[index];
    if (typeof source.integrationMode !== "string" || typeof source.hasApiKey !== "boolean") throw invalid();
    return { ...p, integrationMode: source.integrationMode, hasApiKey: source.hasApiKey };
  });
}
export function parseEmbeddingProviders(value: unknown): EmbeddingProvider[] {
  if (!Array.isArray(value)) throw invalid();
  return value.map(v => {
    if (!v || typeof v !== "object" || ![v.name, v.type, v.modelName, v.baseUrl].every(s => typeof s === "string") || typeof v.hasApiKey !== "boolean" || typeof v.defaultProvider !== "boolean" || !Number.isInteger(v.dimensions) || v.dimensions < 1 || v.dimensions > 8192 ||
      !(v.timeoutMillis === null || Number.isInteger(v.timeoutMillis)) || !(v.maxRetries === null || Number.isInteger(v.maxRetries))) throw invalid();
    return { defaultProvider: v.defaultProvider, name: v.name, type: v.type, modelName: v.modelName, baseUrl: v.baseUrl, hasApiKey: v.hasApiKey, dimensions: v.dimensions, timeoutMillis: v.timeoutMillis, maxRetries: v.maxRetries };
  });
}

export type ProviderTestResult = { connected: boolean; latencyMs: number };
export function parseProviderTest(value: unknown): ProviderTestResult {
  if (!value || typeof value !== "object" || !("connected" in value) || typeof value.connected !== "boolean" || !("latencyMs" in value) || typeof value.latencyMs !== "number" || !Number.isFinite(value.latencyMs) || value.latencyMs < 0) throw invalid();
  return { connected: value.connected, latencyMs: value.latencyMs };
}
