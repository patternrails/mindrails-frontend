/** Suggested editable metadata; file contents stay on the user's device until submission. */
export function knowledgeFileDefaults(filename: string) {
  const extension = filename.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? "";
  const stem = extension ? filename.slice(0, -(extension.length + 1)) : filename;
  const slug = stem.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  // Non-Latin names still need an ASCII key accepted by the backend.
  let hash = 2166136261;
  for (const character of filename) hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619);
  const key = (slug || `document-${(hash >>> 0).toString(36)}`).slice(0, 128).replace(/-+$/g, "");
  const format = ({ pdf: "document", docx: "document", pptx: "slides", md: "markdown", txt: "text", html: "document", htm: "document" } as Record<string, string>)[extension];
  const words = stem.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const tags = [...new Set([extension, format, ...words.filter(word => word.length > 1 && !/^\d+$/.test(word))]
    .filter((tag): tag is string => !!tag).map(tag => tag.slice(0, 64)))].slice(0, 6);
  return { key, title: filename, tags };
}

export const knowledgeFileAccept = ".txt,.md,.html,.htm,.pdf,.docx,.pptx";
export const maxKnowledgeFileBytes = 25 * 1024 * 1024;
export function knowledgeFileError(file: Pick<File, "name" | "size">): "format" | "size" | null {
  if (!/\.(txt|md|html|htm|pdf|docx|pptx)$/i.test(file.name)) return "format";
  if (file.size > maxKnowledgeFileBytes) return "size";
  return null;
}
