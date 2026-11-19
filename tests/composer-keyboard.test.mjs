import assert from "node:assert/strict";
import test from "node:test";
import { isSendShortcut } from "../src/lib/composer-keyboard.ts";

const enter = { key: "Enter", shiftKey: false, isComposing: false, keyCode: 13 };

test("Enter sends while Shift+Enter leaves the native newline behavior", () => {
  assert.equal(isSendShortcut(enter, false), true);
  assert.equal(isSendShortcut({ ...enter, shiftKey: true }, false), false);
  assert.equal(isSendShortcut({ ...enter, key: "a", keyCode: 65 }, false), false);
});

test("IME candidate confirmation never sends, including keyCode 229", () => {
  assert.equal(isSendShortcut({ ...enter, isComposing: true }, false), false);
  assert.equal(isSendShortcut({ ...enter, keyCode: 229 }, false), false);
  assert.equal(isSendShortcut(enter, true), false);
  assert.equal(isSendShortcut(enter, false), true);
});
