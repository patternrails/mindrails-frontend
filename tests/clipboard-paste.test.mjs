import test from "node:test";
import assert from "node:assert/strict";
import { clipboardFiles, pasteClipboardFiles } from "../src/lib/clipboard-paste.ts";

test("plain and rich clipboard text stay out of the upload flow for native textarea insertion", () => {
  for (const text of ["中文引用\n第二行", "", "https://example.com", "\tA\tB\n1\t2"]) {
    assert.deepEqual(clipboardFiles({
      items: [{ kind: "string", type: "text/plain" }, { kind: "string", type: "text/html" }],
      files: [], getData: () => text,
    }), []);
  }
});
test("clipboard files keep their original names and content even alongside duplicate text", async () => {
  const files = [new File(["document"], "合同.doc"), new File(["image"], "截图.png", { type: "image/png" }), new File(["sheet"], "预算.xlsx"), new File(["text file"], "说明.txt")];
  const result = clipboardFiles({
    items: [{ kind: "string", type: "text/plain" }, ...files.map(file => ({ kind: "file", getAsFile: () => file }))],
    files, getData: () => "duplicate filenames",
  });
  assert.deepEqual(result, files);
  assert.equal(await result[0].text(), "document");
});
test("clipboard falls back to the file list when item file handles are unavailable", () => {
  const file = new File(["sample"], "附件.docx");
  assert.deepEqual(clipboardFiles({ items: [], files: [file] }), [file]);
  assert.deepEqual(clipboardFiles({ items: [{ kind: "file", getAsFile: () => null }], files: [file] }), [file]);
  assert.deepEqual(clipboardFiles({ items: [{ kind: "file", getAsFile: () => null }] }), []);
});
test("a text-only paste is never consumed, so the textarea inserts the text natively", () => {
  for (const text of ["纯文本", "", "https://example.com", "\tA\tB\n1\t2"]) {
    let prevented = 0;
    const added = [];
    const handled = pasteClipboardFiles({
      clipboardData: { items: [{ kind: "string", type: "text/plain" }, { kind: "string", type: "text/html" }], files: [], getData: () => text },
      preventDefault: () => { prevented += 1; },
    }, files => { added.push(files); return true; });
    assert.equal(handled, false);
    assert.equal(prevented, 0);
    assert.deepEqual(added, []);
  }
});
test("a file paste is consumed exactly once and handed to the uploader", () => {
  const files = [new File(["document"], "合同.doc"), new File(["image"], "截图.png", { type: "image/png" }), new File(["sheet"], "预算.xlsx")];
  let prevented = 0;
  let received;
  const handled = pasteClipboardFiles({
    clipboardData: { items: [{ kind: "string", type: "text/plain" }, ...files.map(file => ({ kind: "file", getAsFile: () => file }))], files },
    preventDefault: () => { prevented += 1; },
  }, value => { received = value; return true; });
  assert.equal(handled, true);
  assert.equal(prevented, 1);
  assert.deepEqual(received, files);
});
test("files are not swallowed when the uploader refuses them", () => {
  const file = new File(["sheet"], "预算.xlsx");
  let prevented = 0;
  const handled = pasteClipboardFiles({
    clipboardData: { items: [{ kind: "file", getAsFile: () => file }], files: [file] },
    preventDefault: () => { prevented += 1; },
  }, () => false);
  assert.equal(handled, false);
  assert.equal(prevented, 0);
});
test("missing clipboard data and missing items degrade to plain text handling", () => {
  assert.deepEqual(clipboardFiles(null), []);
  assert.deepEqual(clipboardFiles(undefined), []);
  assert.deepEqual(clipboardFiles({ items: null, files: null }), []);
  const file = new File(["sample"], "附件.docx");
  assert.deepEqual(clipboardFiles({ files: [file] }), [file]);
});
test("the same file handle repeated in one paste uploads once", () => {
  const file = new File(["image"], "截图.png", { type: "image/png" });
  assert.deepEqual(clipboardFiles({ items: [{ kind: "file", getAsFile: () => file }, { kind: "file", getAsFile: () => file }], files: [file, file] }), [file]);
});
test("a browser that throws from getAsFile still falls back to its file list", () => {
  const file = new File(["sample"], "附件.docx");
  assert.deepEqual(clipboardFiles({ items: [{ kind: "file", getAsFile: () => { throw new Error("detached"); } }], files: [file] }), [file]);
});
