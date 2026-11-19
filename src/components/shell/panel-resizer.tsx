"use client";

import { useI18n } from "@/i18n/use-i18n";
import type { ResizablePanel } from "@/lib/panel-width";
import type { PanelResizeControls } from "@/components/shell/use-panel-resize";

export function PanelResizer({ panel, width, bounds, enabled, onKeyDown, pointerHandlers, label }:
  PanelResizeControls & { panel: ResizablePanel; label?: string }) {
  const { t } = useI18n();
  const hint = t(panel === "menu" ? "shell.resizeMenuHint" : "shell.resizeDetailsHint");
  return <>
    <span id={`${panel}-resize-hint`} className="sr-only">{hint}</span>
    <div className={`panel-resizer ${panel}-resizer`} role="separator" tabIndex={0} hidden={!enabled}
      aria-label={label ?? t(panel === "menu" ? "shell.resizeMenu" : "shell.resizeDetails")}
      aria-describedby={`${panel}-resize-hint`} aria-orientation="vertical"
      aria-controls={panel === "menu" ? "sidebar-panel" : "workspace-details"}
      aria-valuemin={bounds.min} aria-valuemax={bounds.max} aria-valuenow={width}
      aria-valuetext={`${Math.round(width)}px`} title={hint}
      onKeyDown={onKeyDown} {...pointerHandlers} />
  </>;
}
