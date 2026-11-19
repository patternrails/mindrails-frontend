export const panelWidthSettings = {
  menu: { defaultWidth: 172, maxFraction: 1 / 3 },
  details: { defaultWidth: 220, maxFraction: 2 / 3 },
} as const;
export type ResizablePanel = keyof typeof panelWidthSettings;

export function panelWidthBounds(containerWidth: number, panel: ResizablePanel) {
  const settings = panelWidthSettings[panel];
  const max = Math.max(0, Math.floor(containerWidth * settings.maxFraction));
  return { min: Math.min(settings.defaultWidth, max), max };
}

export function clampPanelWidth(width: number, containerWidth: number, panel: ResizablePanel) {
  const { min, max } = panelWidthBounds(containerWidth, panel);
  return Math.min(max, Math.max(min, width));
}
