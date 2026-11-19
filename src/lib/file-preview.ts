import { BackendClientError } from "./backend-client.ts";
import { backendDownloadPath } from "./backend-download.ts";
import { isUuid } from "./backend-sessions.ts";

export type FilePreview = { filename: string; kind: "text" | "markdown" | "json" | "html" | "csv" | "image"; bytes: number; content: string; renderedHtml: string | null; mediaType?: string | null };
export const previewableFilename = (name: string) => /\.(?:txt|md|markdown|json|html?|csv|png|jpe?g|webp|gif|bmp|avif)$/i.test(name);

/** Only resource identifiers are accepted; never a server path or arbitrary URL. */
export function fileResource(segments: readonly string[]) {
  if (segments.length === 2 && segments[0] === "assets" && isUuid(segments[1]))
    return `/api/asset-storage/versions/${segments[1]}`;
  if (segments.length === 4 && ["sessions", "task-executions"].includes(segments[0]) &&
      isUuid(segments[1]) && segments[2] === "deliverables" && isUuid(segments[3]))
    return `/api/asset-storage/${segments.join("/")}`;
  return null;
}

export function fileViewHref(base: string | undefined, href: string) {
  const path = backendDownloadPath(base, href);
  if (!path?.startsWith("/api/asset-storage/")) return null;
  const segments = path.slice("/api/asset-storage/".length, -"/download".length).split("/");
  if (segments[0] === "versions") segments[0] = "assets";
  return fileResource(segments) ? `/files/${segments.join("/")}` : null;
}

export function parseFilePreview(value: unknown): FilePreview {
  const p = value as FilePreview | null;
  if (!p || typeof p.filename !== "string" || !["text", "markdown", "json", "html", "csv", "image"].includes(p.kind) ||
      !Number.isSafeInteger(p.bytes) || p.bytes < 0 || typeof p.content !== "string" ||
      (p.kind === "html" ? typeof p.renderedHtml !== "string" : p.renderedHtml !== null))
    throw new BackendClientError("invalid-response", "Invalid file preview response.");
  if (p.kind === "image" && !["image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp", "image/avif"].includes(p.mediaType ?? ""))
    throw new BackendClientError("invalid-response", "Invalid image preview response.");
  return p;
}

/** Whitespace-only formatting keeps number lexemes (including large integers) intact. */
export function formatJsonText(text: string): string | null {
  try { JSON.parse(text); } catch { return null; }
  let output = "", depth = 0, quoted = false, escaped = false;
  const compact = text.trim();
  for (let i = 0; i < compact.length; i++) {
    const c = compact[i];
    if (quoted) {
      output += c;
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') quoted = false;
      continue;
    }
    if (c === '"') { quoted = true; output += c; }
    else if (/\s/.test(c)) continue;
    else if (c === "{" || c === "[") {
      if (++depth > 128) return null;
      output += c + "\n" + "  ".repeat(depth);
    } else if (c === "}" || c === "]") output += "\n" + "  ".repeat(--depth) + c;
    else if (c === ",") output += ",\n" + "  ".repeat(depth);
    else if (c === ":") output += ": ";
    else output += c;
    if (output.length > 4 * 1024 * 1024) return null;
  }
  return output;
}

/** Bounded RFC-style comma-separated records; validates even rows omitted from the table. */
export function csvPreview(text: string, maxRows = 201, maxColumns = 50, maxCell = 2000) {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false, closed = false, started = false;
  let columns = 0, records = 0, truncated = false;
  const append = (c: string) => { if (field.length < maxCell) field += c; else truncated = true; };
  const cell = () => {
    if (columns++ < maxColumns) row.push(field); else truncated = true;
    field = ""; closed = false;
  };
  const record = () => {
    cell();
    if (records++ < maxRows) rows.push(row); else truncated = true;
    row = []; columns = 0; started = false;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { append('"'); i++; }
        else { quoted = false; closed = true; }
      } else append(c);
    } else if (c === ",") { cell(); started = true; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; record(); }
    else if (c === '"' && !field && !closed) { quoted = true; started = true; }
    else if (c === '"' || closed) return { rows: [], truncated, error: true };
    else { append(c); started = true; }
  }
  if (quoted) return { rows: [], truncated, error: true };
  if (started || closed || field || columns) record();
  return { rows, truncated, error: false };
}
