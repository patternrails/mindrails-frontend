"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Bot, BrainCircuit, PanelsTopLeft, Settings, SlidersHorizontal } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { ConnectionStatus } from "@/components/shell/connection-status";
import { UserMenu } from "@/components/shell/user-menu";
import { PanelToggle } from "@/components/shell/panel-toggle";
import { PanelResizer } from "@/components/shell/panel-resizer";
import type { PanelResizeControls } from "@/components/shell/use-panel-resize";
import { useUiPreferences } from "@/providers/ui-preferences-provider";
import { WorkspaceNavigation } from "@/features/workspace/workspace-navigation";
import { useSidebarSessions } from "@/features/workspace/use-sidebar-sessions";
import { useI18n } from "@/i18n/use-i18n";
import { Wordmark } from "@/components/brand/wordmark";

const navigation = [
  { href: "/workspace", label: "nav.workspace", icon: PanelsTopLeft },
  { href: "/agents", label: "nav.agents", icon: Bot },
  { href: "/library", label: "nav.library", icon: BookOpen },
  { href: "/customize", label: "nav.customize", icon: SlidersHorizontal },
  { href: "/settings", label: "nav.settings", icon: Settings },
] as const;

export function Sidebar({ resize }: { resize: PanelResizeControls }) {
  const { t } = useI18n();
  const sessions = useSidebarSessions();
  const pathname = usePathname();
  const { preferences: { sidebarCollapsed }, toggleSidebar } = useUiPreferences();
  const compact = !sidebarCollapsed;
  return <aside data-workspace={compact} id="sidebar-panel" className="sidebar" aria-label={t("shell.sidebar")}>
    <Link className="brand" href="/workspace" aria-label={t("shell.brand")}>
      <BrainCircuit className="brand-icon" size={30} aria-hidden="true" />{!sidebarCollapsed && <Wordmark />}
    </Link>
    <div className="sidebar-body">
      <nav id="sidebar-menu" className={compact ? "workspace-icon-nav" : undefined} aria-label={t("shell.navigation")}>
        {navigation.filter(item => !compact || item.href !== "/workspace").map(({ href, label, icon: Icon }) => (
          <Tooltip key={href} label={t(label)} enabled={sidebarCollapsed || compact}>
            <Link href={href} className="nav-link" aria-label={t(label)}
              aria-current={pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined}>
              <Icon size={19} aria-hidden="true" />
              <span className={sidebarCollapsed || compact ? "sr-only" : "sidebar-label"}>{t(label)}</span>
            </Link>
          </Tooltip>
        ))}
      </nav>
      {!sidebarCollapsed && <WorkspaceNavigation index={sessions} />}
    </div>
    <div className="sidebar-footer">
      <ConnectionStatus collapsed={sidebarCollapsed} />
      <UserMenu key={`${sidebarCollapsed}`} collapsed={sidebarCollapsed} />
    </div>
    <PanelResizer panel="menu" {...resize} />
    <PanelToggle panel="menu" collapsed={sidebarCollapsed} onToggle={toggleSidebar}
      resize={resize.enabled ? resize.pointerHandlers : undefined} />
  </aside>;
}
