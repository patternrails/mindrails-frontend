import type { Session } from "@/lib/ui-models";
import { dailyTurns, failureTurns, planningTurns } from "@/mocks/conversations";

export const demoSessions: Session[] = [
  {
    id: "frontend-planning", agentId: "development", title: "Frontend planning",
    draft: "", turns: planningTurns, selectedTurnId: "planning-turn-1",
  },
  {
    id: "tool-failure", agentId: "development", title: "Tool failure example",
    draft: "", turns: failureTurns, selectedTurnId: "failure-turn-1",
  },
  {
    id: "weekly-planning", agentId: "daily", title: "Weekly planning",
    draft: "", turns: dailyTurns, selectedTurnId: "daily-turn-1",
  },
];
