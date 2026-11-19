type ComposerKey = {
  key: string;
  shiftKey: boolean;
  isComposing: boolean;
  keyCode: number;
};

export function isSendShortcut(event: ComposerKey, compositionActive: boolean) {
  // Some IMEs report keyCode 229 on the Enter that confirms a candidate.
  return event.key === "Enter" && !event.shiftKey && !event.isComposing &&
    event.keyCode !== 229 && !compositionActive;
}
