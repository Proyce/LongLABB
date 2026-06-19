import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/LongLabApp.jsx";
import AppErrorBoundary from "./ui/AppErrorBoundary.jsx";

if (!window.storage) {
  const DB_NAME = "longlab-storage";
  const STORE_NAME = "kv";

  let dbPromise;
  const openDb = () => {
    if (!("indexedDB" in window)) {
      return Promise.reject(new Error("IndexedDB is unavailable"));
    }

    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);

        request.onupgradeneeded = () => {
          request.result.createObjectStore(STORE_NAME);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }

    return dbPromise;
  };

  const idbRequest = async (mode, action) => {
    const db = await openDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      const request = action(store);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  };

  const idbGet = key => idbRequest("readonly", store => store.get(key));
  const idbSet = (key, value) => idbRequest("readwrite", store => store.put(value, key));
  const idbDelete = key => idbRequest("readwrite", store => store.delete(key));

  window.storage = {
    get: async (key) => {
      try {
        const value = await idbGet(key);
        if (value != null) return { value };
      } catch (_) {}

      try {
        const localValue = localStorage.getItem(key);
        if (localValue != null) {
          await idbSet(key, localValue).catch(() => {});
          return { value: localValue };
        }
      } catch (_) {
        return { value: null };
      }

      return { value: null };
    },
    set: async (key, value) => {
      await idbSet(key, value);

      try {
        localStorage.removeItem(key);
      } catch (_) {}
    },
    remove: async (key) => {
      await idbDelete(key);

      try {
        localStorage.removeItem(key);
      } catch (_) {}
    },
    clearLocalCopy: (key) => {
      try {
        localStorage.removeItem(key);
      } catch (_) {}
    },
  };

  // One-time migration: copy sl_v3:* data into longlab:v1:* if new keys are absent.
  // LongLAB never writes to sl_v3:* keys. Legacy keys are preserved and never deleted.
  const MIGRATION_MAP = [
    ["sl_v3:samples",               "longlab:v1:samples"],
    ["sl_v3:watchlist",             "longlab:v1:watchlist"],
    ["sl_v3:run",                   "longlab:v1:run"],
    ["sl_v3:holdMs",                "longlab:v1:holdMs"],
    ["sl_v3:aes_discovery_events",  "longlab:v1:discoveryEvents"],
    ["sl_v3:aes_shadow_trades",     "longlab:v1:shadowTrades"],
    ["sl_v3:aes_discovery_config",  "longlab:v1:discoveryConfig"],
  ];
  MIGRATION_MAP.forEach(([oldKey, newKey]) => {
    idbGet(newKey).then(existing => {
      if (existing != null) return; // new key already has data — skip
      return idbGet(oldKey).then(legacyValue => {
        if (legacyValue != null) {
          idbSet(newKey, legacyValue).catch(() => {});
        }
      });
    }).catch(() => {});
  });

  // Clean up legacy localStorage copies (read-only migration; does not delete IndexedDB sl_v3 keys)
  ["sl_v3:samples", "sl_v3:watchlist", "sl_v3:run", "sl_v3:holdMs"].forEach(key => {
    idbGet(key).then(value => {
      if (value != null) {
        try {
          localStorage.removeItem(key);
        } catch (_) {}
      }
    }).catch(() => {});
  });
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>
);
