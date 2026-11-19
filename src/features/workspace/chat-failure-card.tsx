"use client";

import { useState } from "react";
import { AlertTriangle, Check, Copy, CornerUpLeft } from "lucide-react";
import type { ChatTurn } from "@/lib/workspace-conversation";
import { chatErrorKind } from "@/lib/chat-errors";
import { useI18n } from "@/i18n/use-i18n";

export function ChatFailureCard({ turn, canRestore, onRestore }: {
  turn: ChatTurn; canRestore: boolean; onRestore: () => void;
}) {
  const { t } = useI18n();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const error = turn.error, kind = chatErrorKind(error, turn.status);
  const providerMessage = error?.reason === "PROVIDER_ERROR" ? error.message : undefined;
  const requestId = error?.requestId ?? turn.id;
  return <section className="chat-failure-card" aria-label={t(`chatError.${kind}.title`)}>
    <div className="chat-failure-heading" role="alert">
      <AlertTriangle size={17} aria-hidden="true" />
      <div><h3>{t(`chatError.${kind}.title`)}</h3><p>{providerMessage ?? t(`chatError.${kind}.description`)}</p></div>
    </div>
    {turn.assistant?.trim() && <p className="chat-failure-partial">{t("chatError.partial")}</p>}
    <div className="chat-failure-actions">
      <button type="button" className="text-button" disabled={!canRestore} onClick={onRestore}>
        <CornerUpLeft size={13} aria-hidden="true" />{t("rest.restoreDraft")}
      </button>
    </div>
    <details className="chat-failure-details"><summary>{t("chatError.details")}</summary>
      <dl>
        {error?.code && <div><dt>{t("chatError.code")}</dt><dd>{error.reason === "PROVIDER_ERROR" ? error.code : error.reason ?? error.code}</dd></div>}
        <div><dt>{t("rest.provider")}</dt><dd>{turn.providerName} · {turn.modelName}</dd></div>
        {error?.message && !providerMessage && <div><dt>{t("chatError.message")}</dt><dd>{error.message}</dd></div>}
        {error?.detail && <div><dt>{t("chatError.cause")}</dt><dd><code>{error.detail}</code></dd></div>}
        {error?.status && <div><dt>HTTP</dt><dd>{error.status}</dd></div>}
        <div><dt>{t("chatError.requestId")}</dt><dd className="chat-failure-request"><code>{requestId}</code>
          <button type="button" className="chat-failure-copy" aria-label={t("chatError.copyRequestId")}
            onClick={() => {
              void Promise.resolve().then(() => navigator.clipboard.writeText(requestId)).then(() => setCopyState("copied"))
                .catch(() => setCopyState("failed"));
            }}>
            {copyState === "copied" ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
          </button></dd></div>
      </dl>
      {copyState !== "idle" && <p role="status">{t(copyState === "copied" ? "chatError.copied" : "chatError.copyFailed")}</p>}
    </details>
  </section>;
}
