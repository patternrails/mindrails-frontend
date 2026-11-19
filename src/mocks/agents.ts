import type { Agent } from "@/lib/ui-models";

export const demoAgents: Agent[] = [
  {
    id: "development",
    name: "Development assistant",
    description: "Plan projects and break development work into clear steps.",
    goal: "Turn project ideas into a clear, practical development plan.",
    systemMessage: "Help organize development work. Explain decisions clearly and keep tasks focused.",
  },
  {
    id: "daily",
    name: "Daily assistant",
    description: "Organize everyday tasks and make room for focused work.",
    goal: "Help prioritize everyday tasks and plan a balanced week.",
    systemMessage: "Offer concise, practical suggestions for everyday planning.",
  },
];
