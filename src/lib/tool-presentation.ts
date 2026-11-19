import type { StreamTool } from "./session-stream.ts";
import { BackendClientError } from "./backend-client.ts";

/** Keep routing identifiers intact; simplify only generated MCP names in the UI. */
export function toolDisplayName(name: string): string {
  return /^mcp_[a-f\d]{32}_.+_[a-f\d]{8}$/i.test(name) ? "mcp_execution" : name;
}

export const toolPreview = (value: string): string => {
  const chars = Array.from(value);
  return chars.length > 200 ? chars.slice(0, 200).join("") + "…" : value;
};
export function toolArgumentsPreview(tool: StreamTool): string {
  let args = tool.arguments;
  if (args && Object.keys(args).length === 1 && typeof args.preview === "string") return toolPreview(args.preview);
  if (["write", "write_file", "edit", "edit_file"].includes(tool.name) && args) {
    args = Object.fromEntries(Object.entries(args).filter(([key]) => ["path", "filePath", "file_path", "filename"].includes(key)));
  }
  return toolPreview(args ? JSON.stringify(args, null, 2) : tool.argumentText);
}

/** Latest round first; tool position changes only when it starts, never when it finishes. */
export function toolRounds(tools: StreamTool[]) {
  const rounds = [...new Set(tools.map(tool => tool.round))].sort((a,b) => b-a);
  return rounds.map(round => {
    const ordered = tools.map((tool,index) => ({ tool,index })).filter(item => item.tool.round === round)
      .sort((a,b) => (b.tool.startedOrder ?? -1) - (a.tool.startedOrder ?? -1) || b.index-a.index).map(item => item.tool);
    const active = ordered.find(tool => tool.status === "running") ?? ordered.find(tool => ["pending", "preparing"].includes(tool.status));
    const status = active?.status ?? ordered.find(tool => tool.status === "failed")?.status ?? ordered.find(tool => tool.status === "unconfirmed")?.status ?? ordered.find(tool => tool.status === "stopped")?.status ?? "completed";
    return { round, tools: ordered, active, status };
  });
}

export function parseToolActivity(value: unknown): StreamTool[] {
  const invalid = () => new BackendClientError("invalid-response", "Invalid tool activity.");
  if (!Array.isArray(value)) throw invalid();
  return value.map((tool,index) => {
    if (!tool || typeof tool !== "object" || typeof tool.id !== "string" || !Number.isSafeInteger(tool.round) || tool.round < 1 || typeof tool.name !== "string" ||
        !["completed", "failed"].includes(tool.status) || !tool.arguments || typeof tool.arguments !== "object" || Array.isArray(tool.arguments) ||
        ![tool.result, tool.error].every(value => value === null || typeof value === "string") ||
        !(tool.durationMs === null || typeof tool.durationMs === "number" && Number.isFinite(tool.durationMs) && tool.durationMs >= 0)) throw invalid();
    return { ...tool, executed: true, startedOrder: index, argumentText: "", argumentsOmitted: false, truncated: false };
  });
}
