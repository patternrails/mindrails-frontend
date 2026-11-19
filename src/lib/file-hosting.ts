const previewPolicy = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data:",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

/** Used only as the srcDoc of an iframe with an opaque, sandboxed origin. */
export function sandboxedHtmlDocument(content: string) {
  return `<!doctype html><meta http-equiv="Content-Security-Policy" content="${previewPolicy}">
<meta name="referrer" content="no-referrer">
${content}`;
}
