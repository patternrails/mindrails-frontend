import assert from "node:assert/strict";
import test from "node:test";
import { sandboxedHtmlDocument } from "../src/lib/file-hosting.ts";

test("HTML preview installs its resource policy before the original document", () => {
  const original = '<!doctype html><html lang="zh"><head><style>.card { color: red }</style></head><body><button onclick="next()">Next</button><script>function next() {}</script></body></html>';
  const document = sandboxedHtmlDocument(original);
  const beforeContent = document.slice(0, -original.length);
  assert.ok(document.endsWith(original));
  assert.match(beforeContent, /^<!doctype html><meta http-equiv="Content-Security-Policy"/);
  assert.match(beforeContent, /default-src 'none'/);
  assert.match(beforeContent, /script-src 'unsafe-inline'/);
  assert.match(beforeContent, /base-uri 'none'/);
  assert.match(beforeContent, /name="referrer" content="no-referrer"/);
});
