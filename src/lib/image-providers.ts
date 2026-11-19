import { BackendClientError } from "./backend-client.ts";
import { isUuid } from "./backend-sessions.ts";

export type ImageProvider = {
  id: string; name: string; providerName: "qwen" | "openai"; url: string; model: string;
  hasApiKey: boolean; defaultProvider: boolean; enabled: boolean; size: string; promptExtend: boolean;
  timeoutMillis: number; tested: boolean; testSuccess: boolean; testedAt: string | null;
  testLatencyMs: number | null; testMessage: string | null; version: number;
};
const invalid = () => new BackendClientError("invalid-response", "Invalid image provider configuration.");
export function parseImageProvider(value: unknown): ImageProvider {
  if (!value || typeof value !== "object") throw invalid();
  const v = value as Record<string, unknown>;
  if (!isUuid(v.id) || ![v.name, v.url, v.model, v.size].every(s => typeof s === "string" && s.length > 0)
    || !["qwen", "openai"].includes(String(v.providerName))
    || ![v.hasApiKey, v.defaultProvider, v.enabled, v.promptExtend, v.tested, v.testSuccess].every(s => typeof s === "boolean")
    || !Number.isInteger(v.timeoutMillis) || Number(v.timeoutMillis) < 1000 || Number(v.timeoutMillis) > 300000
    || !Number.isSafeInteger(v.version) || Number(v.version) < 0
    || !(v.testedAt === null || typeof v.testedAt === "string" && Number.isFinite(Date.parse(v.testedAt)))
    || !(v.testLatencyMs === null || typeof v.testLatencyMs === "number" && Number.isFinite(v.testLatencyMs) && v.testLatencyMs >= 0)
    || !(v.testMessage === null || typeof v.testMessage === "string")) throw invalid();
  // Copy only public fields; never retain a credential accidentally included in a response.
  return { id: v.id as string, name: v.name as string, providerName: v.providerName as ImageProvider["providerName"],
    url: v.url as string, model: v.model as string, hasApiKey: v.hasApiKey as boolean, defaultProvider: v.defaultProvider as boolean,
    enabled: v.enabled as boolean, size: v.size as string, promptExtend: v.promptExtend as boolean,
    timeoutMillis: v.timeoutMillis as number, tested: v.tested as boolean, testSuccess: v.testSuccess as boolean,
    testedAt: v.testedAt as string | null, testLatencyMs: v.testLatencyMs as number | null,
    testMessage: v.testMessage as string | null, version: v.version as number };
}
export function parseImageProviders(value: unknown): ImageProvider[] {
  if (!Array.isArray(value)) throw invalid();
  const providers = value.map(parseImageProvider);
  if (new Set(providers.map(p => p.id)).size !== providers.length) throw invalid();
  return providers;
}
