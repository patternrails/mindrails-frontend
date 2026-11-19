"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/use-i18n";
import type { Locale } from "@/i18n/types";

export function Modal({ title, description, children, onDismiss, dismissDisabled = false, wide = false, dismissOnOutside = false,
  locale, className, headerActions }: {
  title: string; description: string; children: ReactNode; onDismiss: () => void; dismissDisabled?: boolean;
  wide?: boolean; dismissOnOutside?: boolean; locale?: Locale; className?: string; headerActions?: ReactNode;
}) {
  const { t } = useI18n(locale);
  const ref = useRef<HTMLDialogElement>(null);
  const outsidePress = useRef(false);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);
  const content = <><header className="modal-heading">
    <div><h2 id={`${id}-title`}>{title}</h2><p id={`${id}-description`}>{description}</p></div>
    {headerActions}
  </header>{children}</>;
  const close = <Button className={wide ? "modal-close modal-close-outside" : "modal-close"} variant="ghost" disabled={dismissDisabled} aria-label={t("common.closeDialog")} onClick={onDismiss}>
    <X size={18} aria-hidden="true" />
  </Button>;
  return <dialog ref={ref} className={["ui-modal", wide && "ui-modal-wide", className].filter(Boolean).join(" ")}
    lang={locale === "zh" ? "zh-CN" : locale} aria-labelledby={`${id}-title`}
    aria-describedby={`${id}-description`} onClose={(event) => { if (!event.currentTarget.open && !dismissDisabled) onDismiss(); }}
    onCancel={(event) => { event.preventDefault(); if (!dismissDisabled) onDismiss(); }}
    onPointerDown={event => { outsidePress.current = event.target === event.currentTarget; }}
    onClick={event => { if (dismissOnOutside && !dismissDisabled && outsidePress.current && event.target === event.currentTarget) onDismiss(); outsidePress.current = false; }}
    onKeyDown={(event) => {
      if (event.key !== "Tab") return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]',
      )).filter((element) => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }}>
    {wide ? <div className="modal-panel"><div className="modal-scroll">{content}</div>{close}</div> : <>{content}{close}</>}
  </dialog>;
}
