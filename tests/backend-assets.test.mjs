import test from "node:test";
import assert from "node:assert/strict";
import { isSourceUrl, assetFailed, assetFailureReason, assetErrorMessage } from "../src/lib/backend-assets.ts";
import { citationPlugin } from "../src/lib/citation-links.ts";
import { BackendClient } from "../src/lib/backend-client.ts";

const id = "00000000-0000-4000-8000-000000000001";
test("source URLs accept only local versioned asset/knowledge routes", () => {
  assert.ok(isSourceUrl(`/api/asset-storage/versions/${id}/extractions/${id}/blocks/${id}`));
  assert.ok(isSourceUrl(`/api/knowledge-bases/${id}/documents/${id}/versions/${id}/download`));
  for (const path of ["https://evil.test/file", "/api/asset-storage/../../secret", `/api/asset-storage/versions/${id}/download?token=foo`]) assert.equal(isSourceUrl(path), false);
});
test("only real source labels link; code and unsupported citations remain text", () => {
  const tree = { type: "root", children: [{ type: "paragraph", children: [{ type: "text", value: "Budget [F1], invented [F2]." }] }, { type: "code", value: "[F1]" }] };
  citationPlugin([{ sourceId: id, title: "F1 · Contract · page 1", excerpt: "budget", url: null }])()(tree);
  assert.equal(tree.children[0].children[1].url, "#citation-F1");
  assert.equal(tree.children[0].children[2].value, ", invented [F2].");
  assert.equal(tree.children[1].value, "[F1]");
});
test("upload emits byte progress and client disposal cancels XHR", async () => {
  const original = globalThis.XMLHttpRequest;
  const state = {};
  class FakeXHR {
    upload = {}; status = 200; responseText = '{"ok":true}';
    constructor() { Object.assign(state, { xhr: this }); }
    open(method, url) { this.method = method; this.url = url; }
    send(body) { this.body = body; }
    abort() { this.onabort?.(); }
  }
  globalThis.XMLHttpRequest = FakeXHR;
  try {
    const client = new BackendClient("http://localhost:8080/prefix/");
    const progress = [], body = new FormData(); body.set("file", new File(["fixture"], "a.txt"));
    const result = client.upload("api/asset-storage", body, { signal: new AbortController().signal, onProgress: value => progress.push(value) });
    state.xhr.upload.onprogress({ lengthComputable: true, loaded: 5, total: 10 }); state.xhr.onload();
    assert.deepEqual(await result, { ok: true }); assert.deepEqual(progress, [.5, 1]); assert.equal(state.xhr.url, "http://localhost:8080/prefix/api/asset-storage");
    const pending = client.upload("api/asset-storage", body, { signal: new AbortController().signal, onProgress() {} });
    client.dispose(); await assert.rejects(pending, error => error.code === "cancelled");
  } finally { globalThis.XMLHttpRequest = original; }
});

test("upload errors retain JSON backend reasons and reject proxy HTML as diagnostic text", async () => {
  const original = globalThis.XMLHttpRequest;
  const state = {};
  globalThis.XMLHttpRequest = class {
    upload = {}; status = 400; responseText = JSON.stringify({ message: "Unsupported file type .zip. Supported types: txt, md, html, htm, pdf, docx, pptx" });
    constructor() { state.xhr = this; }
    open() {} send() {} abort() { this.onabort?.(); }
  };
  try {
    const client = new BackendClient("http://localhost:8080");
    const options = { signal: new AbortController().signal, onProgress() {} };
    const result = client.upload("api/asset-storage", new FormData(), options);
    state.xhr.onload();
    await assert.rejects(result, error => error.status === 400 && error.message.includes("Unsupported file type .zip") && error.message.includes("html"));
    const proxy = client.upload("api/asset-storage", new FormData(), options);
    state.xhr.status = 502; state.xhr.responseText = "<html>internal proxy details</html>"; state.xhr.onload();
    await assert.rejects(proxy, error => error.message === "Upload returned HTTP 502.");
  } finally { globalThis.XMLHttpRequest = original; }
});

test("processing failure reasons distinguish parsing and embedding; unexpected errors retain details", () => {
  const parsed = { version: { state: "FAILED", error: "Unsupported file type .zip" }, knowledgeState: null };
  assert.equal(assetFailed(parsed), true);
  assert.equal(assetFailureReason(parsed), "Unsupported file type .zip");
  const indexed = { version: { state: "READY", error: null }, knowledgeState: "FAILED", knowledgeError: "HTTP 429: embedding rate limit" };
  assert.equal(assetFailed(indexed), true);
  assert.equal(assetFailureReason(indexed), "HTTP 429: embedding rate limit");
  assert.equal(assetErrorMessage(new Error("Processing timed out")), "Processing timed out");
  assert.match(assetErrorMessage(null), /Unexpected error/);
  assert.equal(assetFailed({ ...indexed, knowledgeState: "UNAVAILABLE" }), true);
});
