// Almacenamiento local en IndexedDB (los datos nunca salen del teléfono)
const DB_NAME = 'mi-dinero';
const STORES = ['kv', 'txs', 'photos'];
let dbp;

function open() {
  dbp ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('txs')) db.createObjectStore('txs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const os = tx.objectStore(store);
    let result;
    const r = fn(os);
    if (r) r.onsuccess = () => { result = r.result; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const db = {
  get: (store, key) => run(store, 'readonly', os => os.get(key)),
  put: (store, value, key) => run(store, 'readwrite', os => os.put(value, key)),
  del: (store, key) => run(store, 'readwrite', os => os.delete(key)),
  all: store => run(store, 'readonly', os => os.getAll()),
  keys: store => run(store, 'readonly', os => os.getAllKeys()),
  putMany: (store, values) => run(store, 'readwrite', os => { for (const v of values) os.put(v); }),
  clear: () => Promise.all(STORES.map(s => run(s, 'readwrite', os => os.clear()))),
};

export async function askPersistence() {
  try { if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch { /* sin soporte */ }
}
