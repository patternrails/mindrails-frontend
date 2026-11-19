import { agentId } from './backend-agent.mjs';
export const backendProvider = (n = 100, streaming = false) => ({ id: agentId(n), name: `Provider ${n}`, modelName: 'test-model', streaming,
  baseUrl: 'https://example.test/v1', reasoning: true, thinkingLevel: 'high', modelCost: null, contextWindow: 100000, maxTokens: 16000 });
export const backendSession = (n = 10, agent = 1, overrides = {}) => ({ id: agentId(n), ownerId: agentId(99), name: null, parentAgentId: agentId(agent), provider: backendProvider(),
  systemMessage: 'System\nmessage', skillIds: [agentId(200)], memoryId: agentId(201),
  createdAt: '2026-10-12T13:00:00Z', updatedAt: '2026-10-12T13:00:00Z', ...overrides });
export function memoryStorage() {
  const entries = new Map();
  return { get length() { return entries.size; }, key: (n) => [...entries.keys()][n] ?? null,
    getItem: (k) => entries.get(k) ?? null, setItem: (k,v) => entries.set(k,v), removeItem: (k) => entries.delete(k), entries };
}
