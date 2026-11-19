import assert from "node:assert/strict";
import test from "node:test";
import { connectionDisplayStatus } from "../src/lib/backend-presentation.ts";
test("sidebar indicates checking until initialization and preserves connected/disconnected states", () => {
  assert.equal(connectionDisplayStatus({ initialized: false, status: "not-configured" }), "checking");
  for (const status of ["checking", "connected", "disconnected"])
    assert.equal(connectionDisplayStatus({ initialized: true, status }), status);
});
