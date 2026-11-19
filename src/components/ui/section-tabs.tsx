"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

export function SectionTabs({ label, items, value, onValueChange }: {
  label: string;
  items: { id: string; label: string; content: ReactNode }[];
  value: string;
  onValueChange: (value: string) => void;
}) {
  const id = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const previousValue = useRef(value);
  const selected = items.find((item) => item.id === value) ?? items[0];
  useEffect(() => {
    if (previousValue.current === value) return;
    previousValue.current = value;
    // When an action switches sections and removes itself, keep keyboard focus in the tabs.
    if (document.activeElement === document.body) buttons.current[items.findIndex((item) => item.id === value)]?.focus();
  }, [value, items]);
  return <div className="section-tabs">
    <div className="section-tab-list" role="tablist" aria-label={label}>
      {items.map((item, index) => <button key={item.id} type="button" role="tab"
        id={`${id}-tab-${item.id}`} aria-controls={`${id}-panel-${item.id}`}
        aria-selected={selected.id === item.id} tabIndex={selected.id === item.id ? 0 : -1}
        ref={(node) => { buttons.current[index] = node; }}
        onClick={() => onValueChange(item.id)}
        onKeyDown={(event) => {
          const next = event.key === "ArrowRight" ? (index + 1) % items.length :
            event.key === "ArrowLeft" ? (index - 1 + items.length) % items.length :
            event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : null;
          if (next === null) return;
          event.preventDefault();
          onValueChange(items[next].id);
          buttons.current[next]?.focus();
        }}>{item.label}</button>)}
    </div>
    {items.map((item) => <div key={item.id} className="section-tab-panel" role="tabpanel" tabIndex={0}
      hidden={selected.id !== item.id} id={`${id}-panel-${item.id}`} aria-labelledby={`${id}-tab-${item.id}`}>
      {selected.id === item.id ? item.content : null}
    </div>)}
  </div>;
}
