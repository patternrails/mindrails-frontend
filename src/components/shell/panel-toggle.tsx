"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { HTMLAttributes } from "react";
import { useI18n } from "@/i18n/use-i18n";

export function PanelToggle({ panel, collapsed, onToggle, resize, label: labelOverride, hint: hintOverride }: {
  label?: string; hint?: string;
  panel: "menu" | "details"; collapsed: boolean; onToggle: () => void;
  resize?: Pick<HTMLAttributes<HTMLButtonElement>, "onPointerDown" | "onPointerMove" | "onPointerUp" |
    "onPointerCancel" | "onLostPointerCapture" | "onClickCapture">;
}) {
  const { t } = useI18n();
  const pointsLeft = panel === "menu" ? !collapsed : collapsed;
  const Icon = pointsLeft ? ChevronLeft : ChevronRight;
  const label = labelOverride ?? t(panel === "menu" ? collapsed ? "shell.expandMenu" : "shell.collapseMenu" :
    collapsed ? "shell.expandDetails" : "shell.collapseDetails");
  const hint = hintOverride ?? t(panel === "menu" ? "shell.menuToggleHint" : "shell.detailsToggleHint");
  return <button type="button" className={`panel-toggle ${panel}-toggle`} onClick={onToggle}
    {...resize} data-resizable={!!resize}
    aria-label={label} title={resize ? hint : label} aria-expanded={!collapsed}
    aria-describedby={resize ? `${panel}-toggle-hint` : undefined}
    aria-controls={panel === "menu" ? "sidebar-menu" : "workspace-details"}>
    <Icon size={panel === "menu" ? 17 : 15} aria-hidden="true" />
    {resize && <span id={`${panel}-toggle-hint`} className="sr-only">{hint}</span>}
  </button>;
}
