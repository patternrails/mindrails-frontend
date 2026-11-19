export type Agent = {
  id: string;
  name: string;
  description: string;
  goal: string;
  systemMessage: string;
};

export type AgentInput = Omit<Agent, "id">;

export type RunStatus = "generating" | "completed" | "stopped";
export type ToolStatus = "pending" | "running" | "completed" | "failed" | "stopped";

export type ToolCall = {
  id: string;
  name: string;
  status: ToolStatus;
  arguments: Record<string, unknown>;
  result?: string;
  error?: string;
  durationMs?: number;
};

export type Execution = {
  thinking: string;
  tools: ToolCall[];
};

export type ConversationTurn = {
  id: string;
  user: string;
  assistant: string;
  status: RunStatus;
  execution: Execution;
  demoStep: number;
};

export type Session = {
  id: string;
  agentId: string;
  title: string;
  titleKey?: "newSession";
  draft: string;
  turns: ConversationTurn[];
  selectedTurnId: string | null;
};
