import { createBackendConnectionStore } from "../../src/lib/backend-connection-store.ts";
export function createTestConnection(options = {}) {
  let config = null, reader = options.readConfig ?? (() => config);
  const store = createBackendConnectionStore({ ...options, readConfig: () => reader() });
  return { ...store,
    setConfig: base => { config = { version: 1, BASE_URL: base }; return store.reload(); },
    clearConfig: () => { config = null; return store.reload(); },
    setConfigReader: next => { reader = next; },
  };
}
