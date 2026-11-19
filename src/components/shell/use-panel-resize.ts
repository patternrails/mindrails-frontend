"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { clampPanelWidth, panelWidthSettings, panelWidthBounds, type ResizablePanel } from "@/lib/panel-width";

type Drag = {
  pointerId: number;
  startX: number;
  startWidth: number;
  width: number;
  moved: boolean;
  target: HTMLElement;
  restoreStyles: () => void;
};

export function usePanelResize({ panel, collapsed, preferredWidth, saveWidth }: {
  panel: ResizablePanel;
  collapsed: boolean;
  preferredWidth: number;
  saveWidth: (width: number) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const [geometry, setGeometry] = useState({ width: 0, desktop: false });
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const settings = panelWidthSettings[panel];
  // Render the default width until the container is measured after hydration.
  const containerWidth = geometry.width || settings.defaultWidth / settings.maxFraction;
  const width = clampPanelWidth(dragWidth ?? preferredWidth, containerWidth, panel);
  const bounds = panelWidthBounds(containerWidth, panel);
  const enabled = geometry.desktop && !collapsed;

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const media = window.matchMedia("(max-width: 800px)");
    const measure = () => {
      const next = { width: frame.getBoundingClientRect().width, desktop: !media.matches };
      setGeometry((current) => current.width === next.width && current.desktop === next.desktop ? current : next);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    media.addEventListener("change", measure);
    measure();
    return () => {
      observer.disconnect();
      media.removeEventListener("change", measure);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    return () => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      releaseDrag(drag);
      setDragWidth(null);
    };
  }, [enabled]);

  function finishDrag(event: PointerEvent<HTMLElement>, persist: boolean) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    releaseDrag(drag);
    if (persist && drag.moved && frameRef.current) {
      saveWidth(clampPanelWidth(drag.width, frameRef.current.getBoundingClientRect().width, panel));
    }
    setDragWidth(null);
  }

  function onPointerDown(event: PointerEvent<HTMLElement>) {
    if (!enabled || !event.isPrimary || event.button !== 0 || dragRef.current) return;
    suppressClick.current = false;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    const style = document.documentElement.style;
    const previousCursor = style.cursor;
    const previousSelect = style.userSelect;
    style.cursor = "col-resize";
    style.userSelect = "none";
    dragRef.current = {
      pointerId: event.pointerId, startX: event.clientX, startWidth: width, width,
      moved: false, target: event.currentTarget,
      restoreStyles: () => { style.cursor = previousCursor; style.userSelect = previousSelect; },
    };
    setDragWidth(width);
  }

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !frameRef.current) return;
    const delta = (event.clientX - drag.startX) * (panel === "menu" ? 1 : -1);
    if (!drag.moved && Math.abs(delta) <= 4) return;
    drag.moved = true;
    suppressClick.current = true;
    drag.width = clampPanelWidth(drag.startWidth + delta, frameRef.current.getBoundingClientRect().width, panel);
    setDragWidth(drag.width);
  }

  function onClickCapture(event: MouseEvent<HTMLElement>) {
    // Keyboard activation remains available even after a cancelled drag.
    if (suppressClick.current && event.detail > 0) {
      event.preventDefault();
      event.stopPropagation();
      suppressClick.current = false;
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!enabled || dragRef.current) return;
    const step = (event.shiftKey ? 50 : 10) * (panel === "menu" ? -1 : 1);
    const next = event.key === "ArrowLeft" ? width + step : event.key === "ArrowRight" ? width - step :
      event.key === "Home" ? bounds.min : event.key === "End" ? bounds.max : null;
    if (next === null) return;
    event.preventDefault();
    saveWidth(clampPanelWidth(next, containerWidth, panel));
  }

  return {
    frameRef, width, bounds, enabled, resizing: dragWidth !== null, onKeyDown,
    pointerHandlers: {
      onPointerDown, onPointerMove, onClickCapture,
      onPointerUp: (event: PointerEvent<HTMLElement>) => { onPointerMove(event); finishDrag(event, true); },
      onPointerCancel: (event: PointerEvent<HTMLElement>) => finishDrag(event, false),
      onLostPointerCapture: (event: PointerEvent<HTMLElement>) => finishDrag(event, false),
    },
  };
}

export type PanelResizeControls = Omit<ReturnType<typeof usePanelResize>, "frameRef" | "resizing">;

function releaseDrag(drag: Drag) {
  drag.restoreStyles();
  if (drag.target.hasPointerCapture(drag.pointerId)) drag.target.releasePointerCapture(drag.pointerId);
}
