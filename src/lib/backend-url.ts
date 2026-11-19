export class BackendUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackendUrlError";
  }
}

/** Store one trailing slash so relative API paths preserve deployment prefixes. */
export function normalizeBackendUrl(input: string): string {
  const value = input.trim();
  if (!/^https?:\/\//i.test(value) || /[\s\\?#]/.test(value)) {
    throw new BackendUrlError("Use an absolute HTTP(S) URL without whitespace, query parameters or a fragment.");
  }
  let url: URL;
  try { url = new URL(value); }
  catch { throw new BackendUrlError("Enter a valid backend URL."); }
  if (!url.hostname || url.username || url.password) {
    throw new BackendUrlError("The backend URL must have a host and must not include credentials.");
  }
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  return url.href;
}

/** Accept API paths with or without one leading slash, never another origin. */
export function backendEndpoint(baseUrl: string, path: string): string {
  const relative = path.replace(/^\/(?!\/)/, "");
  const pathname = relative.split("?")[0];
  let segments: string[];
  try { segments = pathname.split("/").map(decodeURIComponent); }
  catch { throw new BackendUrlError("The API path contains invalid encoding."); }
  if (!pathname.startsWith("api/") || /[\s\\#]/.test(relative) ||
    segments.some((segment) => segment === "." || segment === ".." || /[\\/]/.test(segment))) {
    throw new BackendUrlError("Use an API path under api/ without traversal or a fragment.");
  }
  return new URL(relative, normalizeBackendUrl(baseUrl)).href;
}
