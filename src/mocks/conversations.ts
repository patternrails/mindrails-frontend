import type { ConversationTurn, Execution } from "@/lib/ui-models";

export const planningTurns: ConversationTurn[] = [
  {
    id: "planning-turn-1",
    user: "Help me outline the next step for the MindRails frontend.",
    assistant: "Start with a workspace you can explore on its own.\n\n1. Add agent and session selection to the sidebar.\n2. Build the conversation view and message composer.\n3. Show execution details alongside each response.\n\nUse local examples to review the experience before connecting the backend.",
    status: "completed",
    demoStep: 4,
    execution: {
      thinking: "Organize the workspace around selecting a session, having a conversation and reviewing the execution. Keep this first pass focused on the interface.",
      tools: [
        {
          id: "planning-read",
          name: "read_document",
          status: "completed",
          arguments: { document: "Workspace checklist", section: "UI components" },
          result: "The checklist covers session selection, conversations, the composer and execution details.",
          durationMs: 32,
        },
      ],
    },
  },
];

export const failureTurns: ConversationTurn[] = [
  {
    id: "failure-turn-1",
    user: "Find the notes for our knowledge library.",
    assistant: "The example lookup did not return any notes. You can still start by listing the sources you want to include and deciding how to organize them.\n\nThis session demonstrates how a failed tool call appears in Details.",
    status: "completed",
    demoStep: 4,
    execution: {
      thinking: "Look for the library notes first. If the lookup fails, explain what is missing and give a useful next step.",
      tools: [
        {
          id: "failure-search",
          name: "search_notes",
          status: "failed",
          arguments: { query: "knowledge library" },
          error: "The sample source is unavailable. No notes were retrieved.",
          durationMs: 48,
        },
      ],
    },
  },
];

export const dailyTurns: ConversationTurn[] = [
  {
    id: "daily-turn-1",
    user: "Help me plan a focused week.",
    assistant: "Choose three outcomes for the week, then give each a place in your calendar.\n\n• Reserve a focused block for your most important task.\n• Group small tasks into one or two shorter blocks.\n• Leave room to review progress and adjust your plan.",
    status: "completed",
    demoStep: 4,
    execution: {
      thinking: "Keep the plan small enough to act on. Balance focused work with a short review and some room for unexpected tasks.",
      tools: [],
    },
  },
];

const developmentReply = [
  "Here is a simple way to move forward.",
  "Here is a simple way to move forward.\n\n1. Choose one small outcome for this session.",
  "Here is a simple way to move forward.\n\n1. Choose one small outcome for this session.\n2. Break it into a few steps you can review separately.",
  "Here is a simple way to move forward.\n\n1. Choose one small outcome for this session.\n2. Break it into a few steps you can review separately.\n3. Check the result, then decide what to do next.\n\nYou can use the execution details to explore the sample thinking and tool activity.",
];

const dailyReply = [
  "Start with a plan that leaves room to adjust.",
  "Start with a plan that leaves room to adjust.\n\n1. Pick the most important outcome for today.",
  "Start with a plan that leaves room to adjust.\n\n1. Pick the most important outcome for today.\n2. Give it a focused block of time.",
  "Start with a plan that leaves room to adjust.\n\n1. Pick the most important outcome for today.\n2. Give it a focused block of time.\n3. Review what worked before planning your next step.",
];

export function getDemoReplyStages(agentId: string) {
  return agentId === "daily" ? dailyReply : developmentReply;
}

export const demoExecution: Execution = {
  thinking: "Prepare a short response from the local example and show a sample checklist lookup. This is a preview of the execution view.",
  tools: [
    {
      id: "demo-checklist",
      name: "read_document",
      status: "pending",
      arguments: { document: "Workspace checklist" },
      result: "Choose an outcome, work in small steps and review the result.",
      durationMs: 32,
    },
  ],
};
