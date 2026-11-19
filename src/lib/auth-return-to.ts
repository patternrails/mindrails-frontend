import { fileResource } from "./file-preview.ts";

/** Deliberately narrow allowlist. No external URLs, encoded paths, queries or auth loops. */
export function safeReturnTo(value: string | null | undefined): string {
  if (value === "/workspace") return value;
  if (value?.startsWith("/files/") && fileResource(value.slice(7).split("/"))) return value;
  return "/workspace";
}
