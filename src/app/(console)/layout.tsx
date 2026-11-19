import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthGate } from "@/providers/auth-provider";
import { BackendProvidersProvider } from "@/providers/backend-providers-provider";
import { BackendAgentsProvider } from "@/providers/backend-agents-provider";
import { TaskWorkspaceProvider } from "@/providers/task-workspace-provider";
import { WorkspaceProvider } from "@/providers/workspace-provider";
import { QuickSetupProvider } from "@/features/settings/provider-quick-setup";

import { UserSessionStatusProvider } from "@/providers/user-session-status-provider";

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate><UserSessionStatusProvider><BackendProvidersProvider><BackendAgentsProvider><WorkspaceProvider><TaskWorkspaceProvider>
      <TooltipProvider><QuickSetupProvider><AppShell>{children}</AppShell></QuickSetupProvider></TooltipProvider>
    </TaskWorkspaceProvider></WorkspaceProvider></BackendAgentsProvider></BackendProvidersProvider></UserSessionStatusProvider></AuthGate>
  );
}
