"use client";

import type { CSSProperties, ReactNode } from "react";
import { Sidebar } from "@/components/shell/sidebar";
import { usePanelResize } from "@/components/shell/use-panel-resize";
import { useUiPreferences } from "@/providers/ui-preferences-provider";
import { useI18n } from "@/i18n/use-i18n";

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { preferences: { sidebarCollapsed, sidebarWidth }, setSidebarWidth } = useUiPreferences();
  const { frameRef, width, bounds, enabled, resizing, onKeyDown, pointerHandlers } =
    usePanelResize({ panel: "menu", collapsed: sidebarCollapsed, preferredWidth: sidebarWidth, saveWidth: setSidebarWidth });
  return <div className="app-shell" ref={frameRef} data-menu-collapsed={sidebarCollapsed}
    data-menu-resizing={resizing} style={{ "--sidebar-expanded-width": `${width}px` } as CSSProperties}>
    <a className="skip-link" href="#main-content">{t("shell.skip")}</a>
    <Sidebar resize={{ width, bounds, enabled, onKeyDown, pointerHandlers }} />
    <main id="main-content" className="main-content" tabIndex={-1}>{children}</main>
  </div>;
}
