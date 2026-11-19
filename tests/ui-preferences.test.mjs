import assert from "node:assert/strict";
import test from "node:test";
import { createPreferencesStore, defaultPreferences, parsePreferences, preferencesStorageKey } from "../src/lib/ui-preferences-store.ts";
import { en } from "../src/i18n/en.ts";
import { zh } from "../src/i18n/zh.ts";
import { translate } from "../src/i18n/format.ts";

test("both dictionaries have the same keys and interpolation parameters", () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort());
  const parameters = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
  for (const key of Object.keys(en)) {
    assert.ok(zh[key].trim(), key);
    assert.deepEqual(parameters(en[key]), parameters(zh[key]), key);
  }
  assert.equal(translate(zh, "agents.created", { name: "A {name} $&" }), "已创建 A {name} $&。");
  assert.equal(translate(en, "workspace.turnMany", { count: 0 }), "0 turns");
});

test("old panel preferences migrate to English; unsupported records fall back safely", () => {
  assert.deepEqual(parsePreferences({ sidebarCollapsed: true, detailsCollapsed: false }), { ...defaultPreferences, sidebarCollapsed: true, detailsCollapsed: false });
  for (const value of [null, [], "zh", {}, { locale: "zh", sidebarCollapsed: "false", detailsCollapsed: true }]) {
    assert.deepEqual(parsePreferences(value), defaultPreferences);
  }
});

test("server rendering stays English while the client ignores saved locale and restores layout", () => {
  let serialized = JSON.stringify({ locale: "zh", sidebarCollapsed: true, detailsCollapsed: true });
  let reads = 0;
  const storage = { getItem: () => { reads++; return serialized; }, setItem: (key, value) => { assert.equal(key, preferencesStorageKey); serialized = value; } };
  const store = createPreferencesStore(() => storage);
  assert.equal(store.getServerSnapshot(), defaultPreferences);
  assert.equal(reads, 0);
  assert.equal(store.getSnapshot().locale, "en");
  assert.equal(store.getSnapshot(), store.getSnapshot());
  assert.equal(reads, 1);
  store.update({ locale: "zh" });
  assert.equal(store.getSnapshot().locale, "zh");
  const layout = { ...defaultPreferences }; delete layout.locale;
  assert.deepEqual(JSON.parse(serialized), { ...layout, sidebarCollapsed: true, detailsCollapsed: true });
  assert.equal(createPreferencesStore(() => storage).getSnapshot().locale, "en");
});

test("corrupt or unavailable storage never prevents in-memory preference changes", () => {
  const corrupt = createPreferencesStore(() => ({ getItem: () => "{broken", setItem: () => {} }));
  assert.deepEqual(corrupt.getSnapshot(), defaultPreferences);
  const blocked = createPreferencesStore(() => { throw new Error("Storage blocked"); });
  assert.deepEqual(blocked.getSnapshot(), defaultPreferences);
  blocked.update({ locale: "zh", sidebarCollapsed: true });
  blocked.update({ detailsCollapsed: true });
  assert.deepEqual(blocked.getSnapshot(), { ...defaultPreferences, locale: "zh", sidebarCollapsed: true, detailsCollapsed: true });
});

test("saved details widths survive updates and reloads; old or invalid widths keep other preferences", () => {
  const flags = { locale: "en", sidebarCollapsed: true, detailsCollapsed: false };
  for (const detailsWidth of [undefined, null, "440", -1, 0, 219, NaN, Infinity]) {
    assert.deepEqual(parsePreferences({ ...flags, detailsWidth }), { ...defaultPreferences, ...flags, detailsWidth: 220 });
  }
  let serialized = JSON.stringify(flags);
  let writes = 0;
  const storage = { getItem: () => serialized, setItem: (_, value) => { serialized = value; writes++; } };
  const store = createPreferencesStore(() => storage);
  assert.equal(store.getSnapshot().detailsWidth, 220);
  assert.equal(writes, 0);
  store.update({ detailsWidth: 440 });
  store.update({ detailsCollapsed: true });
  store.update({ locale: "en" });
  const restored = createPreferencesStore(() => storage).getSnapshot();
  assert.deepEqual(restored, { ...defaultPreferences, ...flags, locale: "en", detailsCollapsed: true, detailsWidth: 440 });
});

test("sidebar widths migrate independently and survive other preference changes", () => {
  const previous = { locale: "en", sidebarCollapsed: false, detailsCollapsed: true, detailsWidth: 440 };
  for (const sidebarWidth of [undefined, null, "320", -1, 0, 171, NaN, Infinity]) {
    assert.deepEqual(parsePreferences({ ...previous, sidebarWidth }), { ...defaultPreferences, ...previous, sidebarWidth: 172 });
  }
  let serialized = JSON.stringify(previous);
  const storage = { getItem: () => serialized, setItem: (_, value) => { serialized = value; } };
  const store = createPreferencesStore(() => storage);
  store.update({ sidebarWidth: 320 });
  store.update({ sidebarCollapsed: true });
  store.update({ detailsWidth: 500 });
  assert.deepEqual(createPreferencesStore(() => storage).getSnapshot(), {
    ...defaultPreferences, ...previous, sidebarCollapsed: true, sidebarWidth: 320, detailsWidth: 500,
  });
});

test("appearance defaults to system for older records and persists without changing layout or locale", () => {
  const previous = { locale: "en", sidebarCollapsed: false, detailsCollapsed: true, detailsWidth: 440, sidebarWidth: 320 };
  for (const appearance of [undefined, null, "auto", "DARK", true, 1]) {
    assert.deepEqual(parsePreferences({ ...previous, appearance }), { ...previous, appearance: "system", theme: "default" });
  }
  let serialized = JSON.stringify(previous);
  const storage = { getItem: () => serialized, setItem: (_, value) => { serialized = value; } };
  const store = createPreferencesStore(() => storage);
  for (const appearance of ["light", "dark", "system"]) {
    store.update({ appearance });
    assert.deepEqual(createPreferencesStore(() => storage).getSnapshot(), { ...previous, appearance, theme: "default" });
  }
});

test("external storage changes and clearing preferences notify active subscribers", () => {
  let serialized = null;
  const store = createPreferencesStore(() => ({ getItem: () => serialized, setItem: (_, value) => { serialized = value; } }));
  let notifications = 0;
  const unsubscribe = store.subscribe(() => notifications++);
  store.update({ locale: "zh" });
  serialized = JSON.stringify({ locale: "en", sidebarCollapsed: true, detailsCollapsed: false });
  store.reload();
  assert.equal(store.getSnapshot().sidebarCollapsed, true);
  serialized = null;
  store.reload();
  assert.deepEqual(store.getSnapshot(), { ...defaultPreferences, locale: "zh" });
  assert.equal(notifications, 3);
  unsubscribe();
  store.update({ locale: "zh" });
  assert.equal(notifications, 3);
});

test('theme restores older preferences and rejects unknown theme IDs without discarding other settings', () => {
  const previous = { ...defaultPreferences, locale: 'en', appearance: 'dark', sidebarCollapsed: true, detailsWidth: 400 };
  delete previous.theme;
  for (const theme of [undefined, null, 'unknown', 'SOLARIZED', {}, 1, '__proto__']) {
    assert.deepEqual(parsePreferences({ ...previous, theme }), { ...previous, theme: 'default' });
  }
});

test('all themes persist and change independently from appearance and panel preferences', () => {
  let serialized = JSON.stringify({ ...defaultPreferences, locale: 'en', sidebarCollapsed: true, detailsWidth: 400 });
  const storage = { getItem: () => serialized, setItem: (_, value) => { serialized = value; } };
  const store = createPreferencesStore(() => storage);
  for (const theme of ['solarized', 'cayman', 'hacker', 'midnight', 'default']) {
    store.update({ theme });
    for (const appearance of ['light', 'dark', 'system']) {
      store.update({ appearance });
      const restored = createPreferencesStore(() => storage).getSnapshot();
      assert.deepEqual(restored, { ...defaultPreferences, theme, appearance, locale: 'en', sidebarCollapsed: true, detailsWidth: 400 });
    }
  }
  serialized = JSON.stringify({ ...defaultPreferences, theme: 'cayman', appearance: 'dark' });
  store.reload();
  assert.equal(store.getSnapshot().theme, 'cayman');
  assert.equal(store.getSnapshot().appearance, 'dark');
});
