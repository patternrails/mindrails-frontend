import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readBackendConfigFile } from "../src/server/backend-config-file.ts";
import { readBackendConfig } from "../src/lib/backend-config-api.ts";
const config = { version: 1, BASE_URL: "http://localhost:8080/prefix/" };

test("deployment configuration is read without modifying or creating files", async t => {
  const dir = await mkdtemp(join(tmpdir(), "mindrails-config-")); t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "backend.json"), raw = JSON.stringify(config);
  await assert.rejects(readBackendConfigFile(path), { code: "ENOENT" });
  await writeFile(path, raw); assert.deepEqual(await readBackendConfigFile(path), config);
  assert.equal(await readFile(path, "utf8"), raw);
  for (const content of ["{broken", '{"version":1,"BASE_URL":"bad"}', '{"version":2,"BASE_URL":"https://example.com"}']) {
    await writeFile(path, content); await assert.rejects(readBackendConfigFile(path)); assert.equal(await readFile(path, "utf8"), content);
  }
});
test("configuration API uses a read-only request without browser storage or cached configuration", async () => {
  assert.deepEqual(await readBackendConfig(async (url, init) => {
    assert.equal(url, "/api/backend-config"); assert.equal(init.method, undefined);
    assert.equal(init.cache, "no-store"); assert.equal(init.credentials, "same-origin"); assert.equal(init.body, undefined);
    return Response.json({ config });
  }), config);
  for (const response of [Response.json({}), Response.json({ config: null }), Response.json({ config: { ...config, BASE_URL: "bad" } }), new Response(null, { status: 503 })])
    await assert.rejects(readBackendConfig(async () => response), { code: "configuration" });
});
