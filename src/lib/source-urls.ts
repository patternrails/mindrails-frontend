const uuid = "[0-9a-f-]{36}";
export function isSourceUrl(path: string) {
  return new RegExp(`^/api/asset-storage/versions/${uuid}/(?:download|extractions/${uuid}/blocks/${uuid})$`, "i").test(path) ||
    new RegExp(`^/api/knowledge-bases/${uuid}/documents/${uuid}/(?:versions/${uuid}/)?(?:download|chunks)$`, "i").test(path);
}
