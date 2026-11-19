"use client";
import type { BackendClient } from "@/lib/backend-client";
import { useEffect, useRef, useState } from "react";
import { useBackendConnection } from "@/providers/backend-connection-provider";
import { assetFailed, assetReady, assetFailureReason, assetErrorMessage, parseAsset, uploadAsset, type AssetView } from "@/lib/backend-assets";

export type AssetUpload = { client: BackendClient; scope?: string; id: string; file: File; kind: string; progress: number; asset?: AssetView; error?: string };
function pause(signal: AbortSignal) { return new Promise<void>((resolve, reject) => { const cancel = () => { clearTimeout(timer); reject(new Error("cancelled")); }; const timer = setTimeout(() => { signal.removeEventListener("abort", cancel); resolve(); }, 1200); signal.addEventListener("abort", cancel, { once: true }); if (signal.aborted) cancel(); }); }
export function useAssetUploads(maxFiles = Number.POSITIVE_INFINITY, scope?: string) {
  const { client } = useBackendConnection();
  const [uploads, setUploads] = useState<AssetUpload[]>([]);
  const [limitReached, setLimitReached] = useState(false);
  const controllers = useRef(new Map<string, AbortController>());
  useEffect(() => { const active = controllers.current; return () => { active.forEach(c => c.abort()); active.clear(); }; }, [client, scope]);
  function patch(id: string, value: Partial<AssetUpload>) { setUploads(items => items.map(item => item.id === id ? { ...item, ...value } : item)); }
  async function perform(item: AssetUpload) {
    if (!client) return;
    const controller = new AbortController(); controllers.current.set(item.id, controller);
    patch(item.id, { error: undefined });
    try {
      let asset = item.asset ? parseAsset(await client.request(`api/asset-storage/versions/${item.asset.version.id}/retry`, { method: "POST", signal: controller.signal })) : await uploadAsset(client, item.file, controller.signal, progress => { if (!controller.signal.aborted) patch(item.id, { progress }); }, item.kind);
      if (!controller.signal.aborted) patch(item.id, { asset, progress: 1 });
      const deadline = Date.now() + 10 * 60_000;
      while (!controller.signal.aborted && !assetReady(asset) && !assetFailed(asset)) {
        if (Date.now() > deadline) throw new Error("Processing timed out");
        await pause(controller.signal);
        asset = parseAsset(await client.request(`api/asset-storage/versions/${asset.version.id}`, { signal: controller.signal }));
        if (!controller.signal.aborted) patch(item.id, { asset });
      }
      if (assetFailed(asset)) throw new Error(assetFailureReason(asset));
    } catch (cause) { if (!controller.signal.aborted) patch(item.id, { error: assetErrorMessage(cause) }); }
    finally { if (controllers.current.get(item.id) === controller) controllers.current.delete(item.id); }
  }
  function add(files: File[], kind = "FILE") {
    if (!client || !files.length) return false;
    if (files.length + uploads.filter(item => item.client === client && item.scope === scope).length > maxFiles) { setLimitReached(true); return false; }
    setLimitReached(false);
    const next = files.map(file => ({ client, scope, id: crypto.randomUUID(), file, kind, progress: 0 }));
    setUploads(items => items.concat(next)); next.forEach(item => void perform(item));
    return true;
  }
  function remove(id: string) { controllers.current.get(id)?.abort(); controllers.current.delete(id); setUploads(items => items.filter(item => item.id !== id)); }
  function clear(ids?: string[]) {
    const selected = new Set(ids ?? uploads.filter(item => item.client === client && item.scope === scope).map(item => item.id));
    for (const id of selected) { controllers.current.get(id)?.abort(); controllers.current.delete(id); }
    setUploads(items => items.filter(item => !selected.has(item.id)));
  }
  const current = uploads.filter(item => item.client === client && item.scope === scope);
  return { limitReached, uploads: current, add, remove, clear, retry: (item: AssetUpload) => void perform(item), pending: current.some(item => !item.error && (!item.asset || !assetReady(item.asset))), ready: current.length > 0 && current.every(item => !item.error && !!item.asset && assetReady(item.asset)) };
}
