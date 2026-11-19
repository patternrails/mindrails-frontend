"use client";

import { useEffect, useRef, useState } from "react";
import { useBackendConnection } from "@/providers/backend-connection-provider";
import type { BackendClient } from "@/lib/backend-client";
import { backendDownloadPath } from "@/lib/backend-download";
import { useI18n } from "@/i18n/use-i18n";

/** Raster preview through the existing authenticated download flow; no public object URLs. */
export function AuthenticatedImage({ href, mediaType, alt, className = "" }: { href: string; mediaType: string; alt: string; className?: string }) {
  const { client } = useBackendConnection(), { t } = useI18n();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ client: BackendClient; path: string; attempt: number; url?: string; failed?: boolean } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const path = backendDownloadPath(client?.BASE_URL, href);
  useEffect(() => {
    if (!client || !path || !["image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp", "image/avif"].includes(mediaType)) return;
    const controller = new AbortController(); let url: string | undefined;
    const load = () => { void client.request<Blob>(path, { responseType: "blob", signal: controller.signal, timeoutMs: 60000, reportTimeout: false })
      .then(blob => {
        if (controller.signal.aborted) return;
        if (!(blob instanceof Blob) || blob.size === 0 || blob.size > 32 * 1024 * 1024) throw new Error("Invalid image");
        url = URL.createObjectURL(new Blob([blob], { type: mediaType }));
        setResult({ client, path, attempt, url });
      }).catch(() => { if (!controller.signal.aborted) setResult({ client, path, attempt, failed: true }); }); };
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { observer?.disconnect(); load(); }
    }, { rootMargin: "300px" });
    if (observer && ref.current) observer.observe(ref.current); else load();
    return () => { observer?.disconnect(); controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [client, path, mediaType, attempt]);
  const current = result?.client === client && result.path === path && result.attempt === attempt ? result : null;
  return <div ref={ref} className={`authenticated-image ${className}`}>
    {current?.url && !current.failed ?
      // Blob URLs cannot be served by the Next image optimizer.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={current.url} alt={alt} onError={() => setResult({ ...current, failed: true })} />
      : <div className="generated-image-placeholder" role="status">{t(current?.failed || !path ? "imageCard.failed" : "imageCard.loading")}
        {current?.failed && <button type="button" className="text-button" onClick={() => setAttempt(value => value + 1)}>{t("imageCard.retry")}</button>}</div>}
  </div>;
}
