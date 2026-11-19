import assert from "node:assert/strict";
import test from "node:test";
import { clampPanelWidth, panelWidthBounds } from "../src/lib/panel-width.ts";

test("details width stays between 220px and two thirds of the workspace", () => {
  assert.deepEqual(panelWidthBounds(900, "details"), { min: 220, max: 600 });
  assert.equal(clampPanelWidth(100, 900, "details"), 220);
  assert.equal(clampPanelWidth(440, 900, "details"), 440);
  assert.equal(clampPanelWidth(900, 900, "details"), 600);
  assert.ok(clampPanelWidth(1000, 1000, "details") <= 1000 * 2 / 3);
});

test("the container cap wins when it cannot fit the normal minimum", () => {
  assert.deepEqual(panelWidthBounds(300, "details"), { min: 200, max: 200 });
  assert.equal(clampPanelWidth(220, 300, "details"), 200);
  assert.equal(clampPanelWidth(440, 0, "details"), 0);
});

test("a saved width is constrained independently for each container size", () => {
  const preferredWidth = 700;
  assert.equal(clampPanelWidth(preferredWidth, 1200, "details"), 700);
  assert.equal(clampPanelWidth(preferredWidth, 750, "details"), 500);
  assert.equal(clampPanelWidth(preferredWidth, 1200, "details"), 700);
});

test("sidebar width uses the full page cap and keeps its own minimum", () => {
  assert.deepEqual(panelWidthBounds(1200, "menu"), { min: 172, max: 400 });
  assert.equal(clampPanelWidth(100, 1200, "menu"), 172);
  assert.equal(clampPanelWidth(320, 1200, "menu"), 320);
  assert.equal(clampPanelWidth(500, 1200, "menu"), 400);
  assert.ok(clampPanelWidth(500, 1000, "menu") <= 1000 / 3);
  assert.equal(clampPanelWidth(320, 480, "menu"), 160);
  assert.equal(clampPanelWidth(320, 1200, "menu"), 320);
});
