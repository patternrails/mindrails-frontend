export const agentId = (n = 1) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const agentInput = { name: "Agent", description: null, goal: null, systemMessage: null };
export const backendAgent = (n = 1, overrides = {}) => ({
  ...agentInput, id: agentId(n), ownerId: agentId(9999), name: `Agent ${n}`,
  sessions: [], skillIds: [], connectionIds: [], memoryId: agentId(8888), knowledgeBaseIds: [],
  createdAt: "2026-10-12T13:00:00Z", updatedAt: "2026-10-12T13:00:00Z", ...overrides,
});
