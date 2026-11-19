"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import { ArrowUp, Square, LoaderCircle, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isSendShortcut } from "@/lib/composer-keyboard";
import { AssetUploads } from "@/features/assets/asset-uploads";
import type { useAssetUploads } from "@/features/assets/use-asset-uploads";
import { useI18n } from "@/i18n/use-i18n";

export function Composer({ draft, generating, disabled, canStop, cancelling, onStop, onDraftChange, onSend, uploads, assetsEnabled, onAttachmentsSent }: {
  uploads: ReturnType<typeof useAssetUploads>;
  assetsEnabled: boolean;
  onAttachmentsSent: () => void;
  draft: string;
  generating: boolean;
  disabled: boolean;
  canStop: boolean;
  cancelling: boolean;
  onStop: () => void;
  onDraftChange: (value: string) => void;
  onSend: (assetVersionIds?: string[], names?: string[], onAccepted?: () => void) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const restoreFocus = useRef(false);
  const locked = disabled || generating;
  const canSend = !disabled && !generating && (draft.trim().length > 0 || uploads.ready) && (!uploads.uploads.length || uploads.ready);

  useEffect(() => {
    if (restoreFocus.current && !generating && !disabled) {
      const activeElement = document.activeElement;
      if (restoreFocus.current && (activeElement === document.body || textareaRef.current?.form?.contains(activeElement))) {
        textareaRef.current?.focus();
      }
      restoreFocus.current = false;
    }
  }, [generating, disabled]);

  function submit() {
    if (!canSend || composing.current) return;
    restoreFocus.current = true;
    if (!draft.trim() && uploads.ready) onDraftChange(t("assets.defaultPrompt"));
    const submitted = uploads.uploads;
    let accepted = false;
    const complete = () => {
      if (accepted) return;
      accepted = true;
      uploads.clear(submitted.map(item => item.id));
      onAttachmentsSent();
    };
    void onSend(submitted.map(item => item.asset!.version.id), submitted.map(item => item.file.name), complete)
      .then(sent => { if (sent) complete(); });
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!isSendShortcut(event.nativeEvent, composing.current)) return;
    event.preventDefault();
    submit();
  }

  return (
    <form className="composer" onSubmit={(event) => {
      event.preventDefault();
      submit();
    }}>
      <div className="composer-box">
        {uploads.limitReached && <p role="alert" className="form-error">{t("assets.limit")}</p>}
        {!!uploads.uploads.length && <AssetUploads items={uploads.uploads} disabled={locked} onRemove={uploads.remove} onRetry={uploads.retry} />}
        <input ref={fileRef} type="file" hidden multiple disabled={locked} onChange={event => { if (!locked) uploads.add(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
        <label className="field-label" htmlFor="workspace-message">{t("workspace.message")}</label>
        <textarea id="workspace-message" ref={textareaRef} value={draft} rows={3} disabled={locked}
          placeholder={t(generating ? "workspace.wait" : "workspace.write")}
          onChange={(event) => onDraftChange(event.target.value)} onKeyDown={onKeyDown}
          onCompositionStart={() => { composing.current = true; }}
          onCompositionEnd={() => { composing.current = false; }}
          aria-describedby="composer-shortcut" />
        <div className="composer-footer">
          {assetsEnabled && <button type="button" className="text-button asset-attach" disabled={locked} onClick={() => fileRef.current?.click()}><Paperclip size={16} />{t("assets.attach")}</button>}
          <span id="composer-shortcut">{t(generating ? "stream.inputLocked" : "workspace.shortcut")}</span>
          {generating && (canStop || cancelling) ? <Button type="button" variant="primary" disabled={!canStop} onClick={onStop}>
            {cancelling ? <LoaderCircle size={14} className="spinning" aria-hidden="true" /> : <Square size={12} fill="currentColor" aria-hidden="true" />}
            {t(cancelling ? "stream.cancelling" : "workspace.stop")}
          </Button> : <Button type="submit" variant="primary" disabled={!canSend}><ArrowUp size={14} aria-hidden="true" />{t("workspace.send")}</Button>}
        </div>
      </div>
    </form>
  );
}
