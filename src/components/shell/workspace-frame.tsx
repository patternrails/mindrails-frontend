"use client";

import type { CSSProperties, ReactNode, Ref } from "react";
import { PanelToggle } from "@/components/shell/panel-toggle";
import { usePanelResize } from "@/components/shell/use-panel-resize";
import { PanelResizer } from "@/components/shell/panel-resizer";
import { useUiPreferences } from "@/providers/ui-preferences-provider";
import { useI18n } from "@/i18n/use-i18n";

export function WorkspaceFrame({ children, details, detailsRef, detailsLabel }: {
  children: ReactNode;
  details: ReactNode;
  detailsLabel?: string;
  detailsRef: Ref<HTMLElement>;
}) {
  const { t } = useI18n();
  const { preferences: { detailsCollapsed, detailsWidth }, toggleDetails, setDetailsWidth } = useUiPreferences();
  const { frameRef, width, bounds, enabled, resizing, onKeyDown, pointerHandlers } =
    usePanelResize({ panel: "details", collapsed: detailsCollapsed, preferredWidth: detailsWidth, saveWidth: setDetailsWidth });
  return <div className="workspace-frame" ref={frameRef} data-details-collapsed={detailsCollapsed}
    data-details-resizing={resizing}
    style={{ "--details-width": `${width}px` } as CSSProperties}>
    <div className="workspace-content">{children}</div>
    <aside id="workspace-details" className="details-panel" hidden={detailsCollapsed}
      aria-label={detailsLabel ?? t("details.title")} ref={detailsRef} tabIndex={-1}>
      {details}
    </aside>
    <PanelResizer panel="details" width={width} bounds={bounds} enabled={enabled}
      label={detailsLabel ? t("tasks.resizeDetails") : undefined} onKeyDown={onKeyDown} pointerHandlers={pointerHandlers} />
    <PanelToggle panel="details" collapsed={detailsCollapsed} onToggle={toggleDetails}
      label={detailsLabel ? t(detailsCollapsed ? "tasks.expandDetails" : "tasks.collapseDetails") : undefined}
      hint={detailsLabel ? t("tasks.detailsToggleHint") : undefined} resize={enabled ? pointerHandlers : undefined} />
  </div>;
}
