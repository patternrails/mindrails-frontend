/** Clipboard shapes we rely on, kept structural so tests can pass plain objects. */
export type ClipboardDataLike = {
  items?: ArrayLike<Pick<DataTransferItem, "kind" | "getAsFile">> | null;
  files?: ArrayLike<File> | null;
};

export type PasteEventLike = {
  clipboardData: ClipboardDataLike | null;
  preventDefault: () => void;
};

/**
 * Files carried by one paste; text-only and rich-text-only clipboards return [].
 * Plain text must keep its native insertion so the cursor position, selection,
 * line breaks and the browser's undo stack stay intact.
 *
 * When a clipboard carries both text and files (a file copied from the desktop,
 * an image copied together with its markup), the files win and the text is not
 * inserted, which is what the attachment flow expects.
 */
export function clipboardFiles(data: ClipboardDataLike | null | undefined): File[] {
  if (!data) return [];
  const items = data.items ? Array.from(data.items) : [];
  const fromItems = items
    .filter(item => item.kind === "file")
    .map(item => {
      try {
        return item.getAsFile();
      } catch {
        return null;
      }
    })
    .filter((file): file is File => !!file);
  // Some browsers expose the file list without usable item handles.
  const candidates = fromItems.length ? fromItems : data.files ? Array.from(data.files) : [];
  // A single paste can repeat the same handle; upload it once.
  return candidates.filter((file, index) => candidates.indexOf(file) === index);
}

/**
 * Consumes a paste only when it carries files. Text pastes always return false
 * and are never prevented, so the focused field receives them unchanged.
 *
 * The files are handed to `add` before the event is cancelled. If `add` reports
 * that it could not take them (upload limit, disconnected backend), the paste
 * stays native instead of disappearing silently.
 */
export function pasteClipboardFiles(
  event: PasteEventLike,
  add: (files: File[]) => boolean | void,
): boolean {
  const files = clipboardFiles(event.clipboardData);
  if (!files.length) return false;
  if (add(files) === false) return false;
  event.preventDefault();
  return true;
}
