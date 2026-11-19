import { BackendClientError } from "./backend-client.ts";
import { isUuid } from "./backend-sessions.ts";

export const webSearchTypes = ["bocha_web_search", "openai_responses", "deepseek_search"] as const;
export type WebSearchType = typeof webSearchTypes[number];

export const webSearchTypesInfo = {
  bocha_web_search: { label: "Bocha", endpoint: "https://api.bocha.cn/v1/web-search" },
  openai_responses: { label: "OpenAI Responses", endpoint: "https://api.openai.com/v1/responses" },
  deepseek_search: { label: "DeepSeek Search", endpoint: "https://api.deepseek.com/v1/tools/search" },
} satisfies Record<WebSearchType, { label: string; endpoint: string }>;

type WebSearchOptions = {
  freshness?: string;
  summary?: boolean;
  search_context_size?: string;
  need_content?: boolean;
};

export type WebSearchProvider = {
  id: string;
  name: string;
  type: WebSearchType;
  endpoint: string;
  modelName: string | null;
  options: WebSearchOptions;
  timeoutMillis: number;
  active: boolean;
  version: number;
};

export type WebSearchProviderInput = Omit<WebSearchProvider, "id" | "active" | "version"> & {
  apiKey: string | null;
  version?: number;
};

function invalid() {
  return new BackendClientError("invalid-response", "Invalid web search provider configuration.");
}

export function parseWebSearchProvider(value: unknown): WebSearchProvider {
  if (!value || typeof value !== "object") throw invalid();
  const entry = value as Record<string, unknown>;
  const { id, name, type, endpoint, modelName, timeoutMillis, active, version } = entry;
  if (!isUuid(id) || typeof name !== "string" || !name || typeof endpoint !== "string" || !endpoint
    || !webSearchTypes.includes(type as WebSearchType)
    || (type === "openai_responses" ? typeof modelName !== "string" || !modelName : modelName !== null)
    || typeof timeoutMillis !== "number" || !Number.isInteger(timeoutMillis) || timeoutMillis < 1 || timeoutMillis > 120000
    || typeof active !== "boolean" || typeof version !== "number" || !Number.isSafeInteger(version) || version < 0
    || !entry.options || typeof entry.options !== "object" || Array.isArray(entry.options)) throw invalid();

  const values = entry.options as Record<string, unknown>;
  const options: WebSearchOptions = {};
  if (type === "bocha_web_search") {
    if (typeof values.freshness === "string") options.freshness = values.freshness;
    if (typeof values.summary === "boolean") options.summary = values.summary;
  }
  if (type === "openai_responses" && typeof values.search_context_size === "string") {
    options.search_context_size = values.search_context_size;
  }
  if (type === "deepseek_search" && typeof values.need_content === "boolean") options.need_content = values.need_content;

  return { id, name, type: type as WebSearchType, endpoint, modelName: modelName as string | null,
    options, timeoutMillis, active, version };
}

export function parseWebSearchProviders(value: unknown): WebSearchProvider[] {
  if (!Array.isArray(value)) throw invalid();
  const entries = value.map(parseWebSearchProvider);
  if (new Set(entries.map(entry => entry.id)).size !== entries.length || entries.filter(entry => entry.active).length > 1) {
    throw invalid();
  }
  return entries;
}
