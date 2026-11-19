const units = ["B", "KB", "MB", "GB", "TB"] as const;

export function formatFileSize(bytes: number, locale = "en") {
  let size = bytes, unit = 0;
  while (Math.round(size * 10) / 10 >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size.toLocaleString(locale, { maximumFractionDigits: 1 })} ${units[unit]}`;
}
