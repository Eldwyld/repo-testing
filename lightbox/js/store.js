/* Lightbox — persistence. Boards (JSON) and image blobs live in IndexedDB;
   settings (incl. the API key) live in localStorage. Nothing leaves the browser
   except the images/prompts you send to the Gemini API. */
(function () {
  'use strict';
  const LB = window.LB;

  /* ---------- settings ---------- */
  const SETTINGS_KEY = 'lightbox.settings.v1';
  const DEFAULTS = {
    apiKey: '',
    imageModel: 'gemini-3.1-flash-image-preview',
    textModel: 'gemini-flash-latest',
    imageSize: 'default',
    wheel: 'pan',
    theme: 'system',
    count: 2,
    ratio: 'auto',
    mode: 'images',
  };
  let settings = { ...DEFAULTS };
  try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch (e) { /* private mode */ }
  const listeners = new Set();
  LB.settings = {
    DEFAULTS,
    get: () => settings,
    set(patch) {
      settings = { ...settings, ...patch };
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
      listeners.forEach((fn) => fn(settings, patch));
    },
    onChange: (fn) => listeners.add(fn),
  };

  /* ---------- IndexedDB ---------- */
  const DB_NAME = 'lightbox', DB_VERSION = 1;
  const mem = { boards: new Map(), blobs: new Map() };
  let dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { return resolve(null); }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('boards')) db.createObjectStore('boards', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    }).then((db) => {
      if (!db) {
        LB.store.persistent = false;
        setTimeout(() => LB.toast('This browser blocked local storage, so boards will vanish when you close the tab.', { type: 'error', timeout: 0 }), 500);
      }
      return db;
    });
    return dbPromise;
  }

  function run(storeName, mode, op) {
    return openDb().then((db) => {
      if (!db) return op(null);
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const req = op(tx.objectStore(storeName));
        tx.oncomplete = () => resolve(req ? req.result : undefined);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Storage transaction aborted'));
      });
    });
  }

  const urls = new Map(); // blob id -> object URL
  const locks = new Map(); // board id -> promise chain

  LB.store = {
    persistent: true,

    async listBoards() {
      const all = await run('boards', 'readonly', (s) => (s ? s.getAll() : null));
      const list = all || Array.from(mem.boards.values());
      return list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    },
    async getBoard(id) {
      const b = await run('boards', 'readonly', (s) => (s ? s.get(id) : null));
      return b || mem.boards.get(id) || null;
    },
    async putBoard(board) {
      const clean = JSON.parse(JSON.stringify(board));
      await run('boards', 'readwrite', (s) => {
        if (!s) { mem.boards.set(clean.id, clean); return null; }
        return s.put(clean);
      });
    },
    async deleteBoard(id) {
      await run('boards', 'readwrite', (s) => {
        if (!s) { mem.boards.delete(id); return null; }
        return s.delete(id);
      });
    },
    /* Serialise read-modify-write updates to one board (e.g. two generations
       finishing at once for a board that isn't open). */
    withBoardLock(id, fn) {
      const prev = locks.get(id) || Promise.resolve();
      const next = prev.catch(() => {}).then(fn);
      locks.set(id, next);
      return next;
    },

    async putBlob(blob, id = LB.uid('b_')) {
      const rec = { id, blob, type: blob.type, size: blob.size, createdAt: Date.now() };
      await run('blobs', 'readwrite', (s) => {
        if (!s) { mem.blobs.set(id, rec); return null; }
        return s.put(rec);
      });
      return id;
    },
    async getBlob(id) {
      const rec = await run('blobs', 'readonly', (s) => (s ? s.get(id) : null));
      const r = rec || mem.blobs.get(id);
      return r ? r.blob : null;
    },
    cachedURL: (id) => urls.get(id) || null,
    primeURL(id, blob) {
      if (!urls.has(id)) urls.set(id, URL.createObjectURL(blob));
      return urls.get(id);
    },
    async getURL(id) {
      if (urls.has(id)) return urls.get(id);
      const blob = await LB.store.getBlob(id);
      if (!blob) return null;
      const url = URL.createObjectURL(blob);
      urls.set(id, url);
      return url;
    },

    /* Remove image blobs no saved board references. Blobs younger than ten
       minutes are kept so in-flight generations never lose their image. */
    async gcBlobs() {
      const boards = await LB.store.listBoards();
      const used = new Set();
      for (const b of boards) {
        for (const it of b.items || []) {
          if (it.blob) used.add(it.blob);
          for (const r of it.refs || []) used.add(r); // "Regenerate" re-sends these
        }
      }
      const recs = await run('blobs', 'readonly', (s) => (s ? s.getAll() : null));
      const list = recs || Array.from(mem.blobs.values());
      const cutoff = Date.now() - 10 * 60 * 1000;
      const dead = list.filter((r) => !used.has(r.id) && (r.createdAt || 0) < cutoff).map((r) => r.id);
      if (!dead.length) return 0;
      await run('blobs', 'readwrite', (s) => {
        for (const id of dead) {
          if (s) s.delete(id); else mem.blobs.delete(id);
          const u = urls.get(id);
          if (u) { URL.revokeObjectURL(u); urls.delete(id); }
        }
        return null;
      });
      return dead.length;
    },

    async estimate() {
      try {
        const e = await navigator.storage.estimate();
        return e.usage || 0;
      } catch (e) { return null; }
    },
    async requestPersistence() {
      try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) { /* ignore */ }
    },
  };
})();
