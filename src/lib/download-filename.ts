export function downloadFilename(disposition: string | null, fallback: string): string {
  let name = fallback;
  if (disposition) {
    const utf = disposition.match(/filename\*=UTF-8''([^;]+)/i), plain = disposition.match(/filename="([^"]*)"|filename=([^;]+)/i);
    try { name = utf ? decodeURIComponent(utf[1]) : plain ? plain[1] ?? plain[2] : fallback; } catch { name = fallback; }
  }
  return name.replace(/[\x00-\x1f\x7f]/g, "").split(/[\\/]/).at(-1)?.trim() || "document";
}
