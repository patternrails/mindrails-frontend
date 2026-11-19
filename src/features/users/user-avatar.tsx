"use client";

import { useEffect, useState } from "react";
import type { UserProfile } from "@/lib/auth-session";
import { useBackendConnection } from "@/providers/backend-connection-provider";

export function UserAvatar({ user, preview }: { user: Pick<UserProfile, "name" | "avatarUrl">; preview?: string }) {
  const { client } = useBackendConnection();
  const [image, setImage] = useState<{ source: string; blob: string } | null>(null);
  useEffect(() => {
    if (!client || !/^\/api\/users\/avatars\/[a-f0-9-]{36}\.png$/.test(user.avatarUrl)) return;
    const controller = new AbortController(); let blob: string | undefined;
    void client.request<Blob>(user.avatarUrl, { responseType: "blob", signal: controller.signal }).then(data => {
      if (!data || controller.signal.aborted) return; blob = URL.createObjectURL(data); setImage({ source: user.avatarUrl, blob });
    }).catch(() => { /* Initials remain available when the image cannot load. */ });
    return () => { controller.abort(); if (blob) URL.revokeObjectURL(blob); };
  }, [client, user.avatarUrl]);
  const source = preview || (image?.source === user.avatarUrl ? image.blob : undefined);
  return <span className="user-avatar" aria-hidden="true">{source ?
    // eslint-disable-next-line @next/next/no-img-element -- authenticated images are fetched as short-lived blob URLs.
    <img src={source} alt="" /> : Array.from(user.name.trim()).slice(0, 2).join("").toLocaleUpperCase() || "?"}</span>;
}
