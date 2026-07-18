const DB_NAME = "ligatec-live-referee";
const DB_VERSION = 1;
const STATE_STORE = "liveMatchState";
const OPERATIONS_STORE = "pendingOperations";

function isIndexedDbAvailable() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function getUuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `op-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function openLiveDb() {
  if (!isIndexedDbAvailable()) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STATE_STORE)) {
        db.createObjectStore(STATE_STORE, { keyPath: "matchId" });
      }
      if (!db.objectStoreNames.contains(OPERATIONS_STORE)) {
        const store = db.createObjectStore(OPERATIONS_STORE, { keyPath: "operationId" });
        store.createIndex("matchId", "matchId", { unique: false });
        store.createIndex("syncStatus", "syncStatus", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB no disponible."));
  });
}

function runStore(storeName, mode, callback) {
  return openLiveDb().then((db) => {
    if (!db) return null;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error || new Error("No se pudo acceder al almacenamiento local."));
      result = callback(store);
    });
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Operacion local fallida."));
  });
}

export async function saveLiveMatchState(state) {
  if (!state?.matchId) return null;
  const payload = {
    ...state,
    lastLocalUpdate: new Date().toISOString()
  };
  await runStore(STATE_STORE, "readwrite", (store) => store.put(payload));
  return payload;
}

export async function getLiveMatchState(matchId) {
  if (!matchId) return null;
  return runStore(STATE_STORE, "readonly", (store) => requestToPromise(store.get(matchId)));
}

export async function listLiveMatchStates() {
  const db = await openLiveDb();
  if (!db) return [];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STATE_STORE, "readonly");
    const store = tx.objectStore(STATE_STORE);
    const request = store.getAll();
    request.onsuccess = () => {
      const rows = Array.isArray(request.result) ? request.result : [];
      resolve(rows.sort((a, b) => String(b.lastLocalUpdate || "").localeCompare(String(a.lastLocalUpdate || ""))));
    };
    request.onerror = () => reject(request.error || new Error("No se pudo leer el respaldo local."));
  });
}

export async function clearLiveMatchState(matchId) {
  if (!matchId) return;
  await runStore(STATE_STORE, "readwrite", (store) => store.delete(matchId));
}

export async function enqueueLiveOperation(operation) {
  if (!operation?.matchId || !operation?.operationType) return null;
  const payload = {
    operationId: operation.operationId || getUuid(),
    matchId: operation.matchId,
    refereeId: operation.refereeId || "",
    operationType: operation.operationType,
    payload: operation.payload || {},
    createdAt: operation.createdAt || new Date().toISOString(),
    clientSessionId: operation.clientSessionId || "",
    localSequenceNumber: Number(operation.localSequenceNumber || Date.now()),
    syncStatus: operation.syncStatus || "pending",
    retryCount: Number(operation.retryCount || 0),
    lastRetryAt: operation.lastRetryAt || ""
  };
  await runStore(OPERATIONS_STORE, "readwrite", (store) => store.put(payload));
  return payload;
}

export async function listPendingLiveOperations(matchId = "") {
  const db = await openLiveDb();
  if (!db) return [];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OPERATIONS_STORE, "readonly");
    const store = tx.objectStore(OPERATIONS_STORE);
    const request = store.getAll();
    request.onsuccess = () => {
      const rows = Array.isArray(request.result) ? request.result : [];
      resolve(rows
        .filter((item) => (!matchId || item.matchId === matchId) && ["pending", "failed", "conflict"].includes(item.syncStatus))
        .sort((a, b) => Number(a.localSequenceNumber || 0) - Number(b.localSequenceNumber || 0)));
    };
    request.onerror = () => reject(request.error || new Error("No se pudo leer la cola local."));
  });
}

export async function markLiveOperationSynced(operationId) {
  const db = await openLiveDb();
  if (!db || !operationId) return;
  await new Promise((resolve, reject) => {
    const tx = db.transaction(OPERATIONS_STORE, "readwrite");
    const store = tx.objectStore(OPERATIONS_STORE);
    const getRequest = store.get(operationId);
    getRequest.onsuccess = () => {
      const current = getRequest.result;
      if (!current) return resolve();
      store.put({ ...current, syncStatus: "synced", lastRetryAt: new Date().toISOString() });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("No se pudo actualizar la cola local."));
  });
}

export async function markLiveOperationFailed(operationId, status = "failed") {
  const db = await openLiveDb();
  if (!db || !operationId) return;
  await new Promise((resolve, reject) => {
    const tx = db.transaction(OPERATIONS_STORE, "readwrite");
    const store = tx.objectStore(OPERATIONS_STORE);
    const getRequest = store.get(operationId);
    getRequest.onsuccess = () => {
      const current = getRequest.result;
      if (!current) return resolve();
      store.put({
        ...current,
        syncStatus: status,
        retryCount: Number(current.retryCount || 0) + 1,
        lastRetryAt: new Date().toISOString()
      });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("No se pudo actualizar la cola local."));
  });
}
