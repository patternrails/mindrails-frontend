import test from "node:test";
import assert from "node:assert/strict";
import { BackendClient } from "../src/lib/backend-client.ts";
import { loginSession } from "../src/lib/auth-session.ts";
import { backendDownloadPath, downloadBackendFile } from "../src/lib/backend-download.ts";

const id = "00000000-0000-4000-8000-000000000001";
const paths = [
  `/api/asset-storage/versions/${id}/download`,
  `/api/asset-storage/sessions/${id}/deliverables/${id}/download`,
  `/api/asset-storage/task-executions/${id}/deliverables/${id}/download`,
  `/api/knowledge-bases/${id}/documents/${id}/versions/${id}/download`,
];
const session = letter => ({ accessToken: letter.repeat(43), accessExpiresAt: "2030-01-01T00:00:00Z", user: { id, language: "en", role: "Normal" } });

function browser(t) {
  const saved = [], blobs = [];
  const previous = globalThis.document;
  globalThis.document = {
    body: { append(link) { link.attached = true; } },
    createElement(tag) {
      assert.equal(tag, "a");
      return { click() { assert.equal(this.attached, true); saved.push({ href: this.href, filename: this.download }); }, remove() { this.attached = false; } };
    },
  };
  t.mock.method(URL, "createObjectURL", blob => { blobs.push(blob); return "blob:test-download"; });
  t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
  return { saved, blobs };
}

test("downloads resolve only allowlisted routes on the configured backend, preserving deployment prefixes", () => {
  const base = "https://backend.example/prefix/";
  for (const path of paths) {
    assert.equal(backendDownloadPath(base, path), path);
    assert.equal(backendDownloadPath(base, base + path.slice(1)), path);
  }
  for (const href of [
    `https://evil.example${paths[0]}`, `https://backend.example${paths[0]}`,
    `https://backend.example/prefix.evil${paths[0]}`, `//evil.example${paths[0]}`,
    `${paths[0]}?token=secret`, `${paths[1]}#fragment`, "/api/users", "/api/asset-storage/../secret/download",
  ]) assert.equal(backendDownloadPath(base, href), undefined);
});

test("attachments, session/task deliverables and sources download bytes with Bearer authentication", async t => {
  const { saved, blobs } = browser(t), base = "https://downloads.example/prefix/";
  await loginSession(base, "alice", "password", async () => Response.json(session("a")));
  const requests = [];
  const client = new BackendClient(base, { fetch: async (url, init) => {
    requests.push(url);
    assert.equal(new Headers(init.headers).get("Authorization"), `Bearer ${"a".repeat(43)}`);
    assert.equal(init.credentials, "omit");
    return new Response("report bytes", { headers: { "Content-Disposition": "attachment; filename*=UTF-8''%E6%8A%A5%E5%91%8A.csv" } });
  } });
  for (const path of paths) await downloadBackendFile(client, path, "fallback.txt", new AbortController().signal);
  assert.deepEqual(requests, paths.map(path => base + path.slice(1)));
  assert.equal(saved.length, paths.length);
  assert.ok(saved.every(file => file.filename === "报告.csv" && file.href.startsWith("blob:")));
  assert.equal(await blobs[0].text(), "report bytes");
});

test("expired download credentials refresh once, then save only the successful file", async t => {
  const { saved } = browser(t), base = "https://refresh-download.example/";
  await loginSession(base, "alice", "password", async () => Response.json(session("a")));
  let refreshes = 0;
  const tokens = [];
  const client = new BackendClient(base, { fetch: async (url, init) => {
    if (url.endsWith("api/auth/refresh")) {
      refreshes++; assert.equal(init.credentials, "include"); return Response.json(session("b"));
    }
    const token = new Headers(init.headers).get("Authorization"); tokens.push(token);
    return token === `Bearer ${"b".repeat(43)}` ? new Response("file") : Response.json({ message: "Invalid or expired credentials" }, { status: 401 });
  } });
  await downloadBackendFile(client, paths[1], "fallback.csv", new AbortController().signal);
  assert.equal(refreshes, 1);
  assert.deepEqual(tokens, [`Bearer ${"a".repeat(43)}`, `Bearer ${"b".repeat(43)}`]);
  assert.deepEqual(saved, [{ href: "blob:test-download", filename: "fallback.csv" }]);
});

test("rejected, cancelled and invalid downloads never save an error response as a file", async t => {
  const { saved } = browser(t);
  let requests = 0;
  const client = new BackendClient("https://rejected-download.example/", { fetch: async () => {
    requests++; return Response.json({ message: "Invalid or expired credentials" }, { status: 401 });
  } });
  await assert.rejects(downloadBackendFile(client, paths[0], "file.txt", new AbortController().signal), error => error.status === 401);
  assert.equal(requests, 1);
  await assert.rejects(downloadBackendFile(client, "https://evil.example/file", "file.txt", new AbortController().signal), error => error.code === "invalid-request");
  const controller = new AbortController(); controller.abort();
  await assert.rejects(downloadBackendFile(client, paths[0], "file.txt", controller.signal), error => error.code === "cancelled");
  assert.equal(requests, 1); assert.deepEqual(saved, []);
});
