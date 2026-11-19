import { BackendClient, BackendClientError } from "./backend-client.ts";

// Shared runtime catalog. Editable configuration APIs are in provider-management.ts.

export type ModelProvider = Readonly<{
  id: string;
  name: string;
  modelName: string;
  streaming: boolean;
  baseUrl: string | null;
  reasoning: boolean | null;
  thinkingLevel: string | null;
  modelCost: number | null;
  contextWindow: number | null;
  maxTokens: number | null;
}>;

const invalidResponse = () => new BackendClientError("invalid-response", "Invalid provider list response.");
const nonemptyString = (value: unknown): value is string => typeof value === "string" && !!value.trim();
const nullableString = (value: unknown): value is string | null => value === null || typeof value === "string";
const nullableNumber = (value: unknown): value is number | null =>
  value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
const nullableTokens = (value: unknown): value is number | null =>
  value === null || (nullableNumber(value) && Number.isSafeInteger(value));

export function parseProviderPage(value: unknown): ModelProvider[] {
  if (!Array.isArray(value)) throw invalidResponse();
  return value.map((entry: unknown) => {
    if (!entry || typeof entry !== "object") throw invalidResponse();
    const p = entry as Record<string, unknown>;
    if (!nonemptyString(p.id) || !nonemptyString(p.name) || !nonemptyString(p.modelName) ||
      typeof p.streaming !== "boolean" || !nullableString(p.baseUrl) ||
      !(p.reasoning === null || typeof p.reasoning === "boolean") || !nullableString(p.thinkingLevel) ||
      !nullableNumber(p.modelCost) || !nullableTokens(p.contextWindow) || !nullableTokens(p.maxTokens)) {
      throw invalidResponse();
    }
    return { id: p.id, name: p.name, modelName: p.modelName, streaming: p.streaming,
      baseUrl: p.baseUrl, reasoning: p.reasoning, thinkingLevel: p.thinkingLevel,
      modelCost: p.modelCost, contextWindow: p.contextWindow, maxTokens: p.maxTokens };
  });
}

/** Backend contract: page 0 starts with the configured default; preserve that order. */
export async function loadBackendProviders(client: BackendClient, signal: AbortSignal): Promise<ModelProvider[]> {
  const size = 100;
  const providers: ModelProvider[] = [];
  const ids = new Set<string>();
  for (let page = 0; ; page++) {
    const batch = parseProviderPage(await client.request(`api/provider?page=${page}&size=${size}`, { signal }));
    if (batch.length > size) throw invalidResponse();
    for (const provider of batch) {
      if (ids.has(provider.id)) throw invalidResponse();
      ids.add(provider.id);
      providers.push(provider);
    }
    if (batch.length < size) return providers;
  }
}
