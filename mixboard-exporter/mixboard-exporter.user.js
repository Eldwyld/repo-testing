// ==UserScript==
// @name         Mixboard Exporter
// @namespace    https://github.com/eldwyld/repo-testing
// @version      1.0.0
// @description  Save every image, the board text and the raw board/prompt data from Google Mixboard as a ZIP.
// @match        https://mixboard.google.com/*
// @match        https://labs.google/mixboard*
// @run-at       document-start
// @grant        none
// @sandbox      raw
// @inject-into  page
// @noframes
// ==/UserScript==
//
// Two ways to run this file:
//   1. Paste the whole file into the DevTools console of an open Mixboard tab (no install needed).
//   2. Install it in Tampermonkey / Violentmonkey so it is already listening when the page loads.
//
// Everything happens inside your browser tab: it re-downloads the images the page itself loaded
// and builds the ZIP locally. Nothing is sent anywhere else.

(function () {
  'use strict';

  if (window.__mixboardExporter) {
    window.__mixboardExporter.show();
    return;
  }

  const settings = {
    minSide: 150,              // skip images whose shorter side is below this (icons, avatars)
    includeSvg: false,         // SVGs are almost always UI icons
    maxApiBytes: 64 << 20,     // cap on raw API responses kept in memory
    zipPartBytes: 1536 << 20,  // start a new ZIP part past this size (plain ZIP tops out at 4 GB)
    concurrency: 4,
    scanIntervalMs: 4000,
  };

  const orig = {
    fetch: window.fetch,
    createObjectURL: URL.createObjectURL,
    xhrOpen: XMLHttpRequest.prototype.open,
    xhrSend: XMLHttpRequest.prototype.send,
  };

  const images = new Map();     // canonical key -> { key, urls:Set, blob, board, seen }
  const apiLog = [];            // { time, method, url, status, type, board, data }
  const boardText = new Map();  // board -> Set of text lines, in first-seen order
  let apiBytes = 0;
  let apiDropped = 0;
  let boardOverride = '';
  let exportedCount = 0;
  let busy = false;

  // ---------------------------------------------------------------- helpers

  function currentBoard() {
    if (boardOverride) return boardOverride;
    const title = (document.title || '')
      .replace(/\s*[-|–—·:]\s*(Google\s+)?(Labs\s+)?Mixboard.*$/i, '')
      .replace(/^(Google\s+)?(Labs\s+)?Mixboard$/i, '')
      .trim();
    const segs = location.pathname.split('/').filter(Boolean);
    const last = segs[segs.length - 1] || '';
    const id = /^(projects?|boards?|mixboard)$/i.test(last) ? '' : last;
    return [title, id].filter(Boolean).join(' - ') || 'Mixboard';
  }

  function safeName(s, max = 80) {
    return (String(s).replace(/[\\/:*?"<>|\x00-\x1f]+/g, '_').replace(/\s+/g, ' ').trim() || 'untitled')
      .slice(0, max).replace(/[. ]+$/, '');
  }

  function parseUrl(url) {
    try { return new URL(url, location.href); } catch { return null; }
  }

  function isGoogleImageHost(u) {
    return /(^|\.)(googleusercontent\.com|ggpht\.com)$/.test(u.hostname);
  }

  // Page chrome that is never user content: account avatars, static UI assets.
  function isNoise(u) {
    if (/(^|\.)gstatic\.com$/.test(u.hostname)) return true;
    if (isGoogleImageHost(u) && /^\/(a|a-|ogw)\//.test(u.pathname)) return true;
    return false;
  }

  // googleusercontent URLs carry the requested size after "=" (…/abc=w512-h512); strip it so
  // the thumbnail and the full-size copy of one image count once.
  function canonical(url) {
    const u = parseUrl(url);
    if (!u || u.protocol === 'blob:' || u.protocol === 'data:') return url;
    if (isGoogleImageHost(u) && !u.search) return u.origin + u.pathname.replace(/=[^/]*$/, '');
    return u.href;
  }

  function fullSizeUrl(url) {
    const u = parseUrl(url);
    if (!u || !/^https?:$/.test(u.protocol) || !isGoogleImageHost(u) || u.search) return null;
    return u.origin + u.pathname.replace(/=[^/]*$/, '') + '=s0';
  }

  function looksLikeImageUrl(url) {
    const u = parseUrl(url);
    if (!u) return false;
    return isGoogleImageHost(u) || /\.(png|jpe?g|webp|gif|avif|heic)$/i.test(u.pathname);
  }

  function addImage(url, blob, board) {
    if (!url || typeof url !== 'string') return;
    if (url.startsWith('data:') && (url.length < 3000 || !url.startsWith('data:image/'))) return;
    const u = parseUrl(url);
    if (!u || !/^(https?|blob|data):$/.test(u.protocol) || isNoise(u)) return;
    const key = canonical(url);
    let item = images.get(key);
    if (!item) {
      item = { key, urls: new Set(), blob: null, board: board || currentBoard(), seen: images.size };
      images.set(key, item);
    }
    item.urls.add(url);
    if (blob && (!item.blob || blob.size > item.blob.size)) item.blob = blob;
    scheduleRender();
  }

  // Board data comes back as JSON (often double-escaped); pull out any image URLs it lists so
  // images that are not on screen yet still get saved.
  function harvestUrls(text) {
    if (typeof text !== 'string' || text.length > 20e6) return;
    const norm = text
      .replace(/\\+u003d/gi, '=').replace(/\\+u0026/gi, '&').replace(/\\+\//g, '/');
    const re = /https?:\/\/[^\s"'<>\\)\]},]+/g;
    let m;
    while ((m = re.exec(norm))) if (looksLikeImageUrl(m[0])) addImage(m[0]);
  }

  function wantsApi(type, url) {
    if (/\/(log|gen_204|jserror|csi)\b|google-analytics|googletagmanager|play\.google\.com\/log/.test(url)) return false;
    return /json|text\/plain|protobuf|grpc/.test(type);
  }

  function logApi(method, url, status, type, data) {
    const size = typeof data === 'string' ? data.length : data.size;
    if (apiBytes + size > settings.maxApiBytes) { apiDropped++; return; }
    apiBytes += size;
    apiLog.push({ time: new Date().toISOString(), method, url, status, type, board: currentBoard(), data });
    if (typeof data === 'string') harvestUrls(data);
    scheduleRender();
  }

  // ------------------------------------------------------ network listeners

  function inspectResponse(res, method, reqUrl) {
    if (!res || res.type === 'opaque' || res.type === 'opaqueredirect') return;
    const url = res.url || reqUrl;
    const type = (res.headers.get('content-type') || '').toLowerCase();
    if (type.startsWith('image/') || type.includes('octet-stream')) {
      res.clone().blob().then((b) => {
        if (type.startsWith('image/')) addImage(url, b);
        else if (b.size > 4096) sniff(b).then((info) => { if (info) addImage(url, b); });
      }).catch(() => {});
    } else if (wantsApi(type, url)) {
      res.clone().text().then((t) => logApi(method, url, res.status, type, t)).catch(() => {});
    }
  }

  window.fetch = function (input, init) {
    const p = orig.fetch.apply(window, arguments);
    try {
      const req = input instanceof Request ? input : null;
      const url = req ? req.url : String(input);
      const method = ((init && init.method) || (req && req.method) || 'GET').toUpperCase();
      p.then((res) => { try { inspectResponse(res, method, url); } catch {} }, () => {});
    } catch {}
    return p;
  };

  XMLHttpRequest.prototype.open = function (method, url) {
    try { this.__mbx = { method: String(method).toUpperCase(), url: String(url) }; } catch {}
    return orig.xhrOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    if (this.__mbx && !this.__mbxHooked) {
      this.__mbxHooked = true;
      this.addEventListener('load', onXhrLoad);
    }
    return orig.xhrSend.apply(this, arguments);
  };

  function onXhrLoad() {
    try {
      const type = (this.getResponseHeader('content-type') || '').toLowerCase();
      const url = this.responseURL || this.__mbx.url;
      const rt = this.responseType;
      let data;
      if (rt === '' || rt === 'text') data = this.responseText;
      else if (rt === 'json') data = JSON.stringify(this.response);
      else if (rt === 'blob') data = this.response;
      else if (rt === 'arraybuffer') data = new Blob([this.response]);
      else return;
      if (type.startsWith('image/')) {
        addImage(url, data instanceof Blob ? new Blob([data], { type }) : null);
      } else if (wantsApi(type, url) && data != null) {
        logApi(this.__mbx.method, url, this.status, type, data);
      }
    } catch {}
  }

  URL.createObjectURL = function (obj) {
    const url = orig.createObjectURL.apply(this, arguments);
    try {
      if (obj instanceof Blob && (obj.type.startsWith('image/') || (!obj.type && obj.size > 4096))) {
        addImage(url, obj);
      }
    } catch {}
    return url;
  };

  try { performance.setResourceTimingBufferSize(100000); } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (/^(img|image|css)$/.test(e.initiatorType)) addImage(e.name);
        else if (looksLikeImageUrl(e.name)) addImage(e.name);
      }
    }).observe({ type: 'resource', buffered: true });
  } catch {}

  // ------------------------------------------------------------- DOM scan

  function* roots(root = document) {
    yield root;
    for (const el of root.querySelectorAll('*')) if (el.shadowRoot) yield* roots(el.shadowRoot);
  }

  function largestFromSrcset(srcset) {
    let best = null, bestW = -1;
    for (const part of (srcset || '').split(/,\s+/)) {
      const [url, d = '1x'] = part.trim().split(/\s+/);
      const w = parseFloat(d) * (d.endsWith('x') ? 10000 : 1);
      if (url && w > bestW) { best = url; bestW = w; }
    }
    return best;
  }

  function scanDom(deep) {
    const board = currentBoard();
    for (const root of roots()) {
      for (const img of root.querySelectorAll('img')) {
        addImage(img.currentSrc || img.src, null, board);
        if (img.srcset) addImage(largestFromSrcset(img.srcset), null, board);
      }
      for (const s of root.querySelectorAll('picture source[srcset]')) addImage(largestFromSrcset(s.srcset), null, board);
      for (const v of root.querySelectorAll('video[poster]')) addImage(v.poster, null, board);
      for (const im of root.querySelectorAll('image')) {
        addImage(im.getAttribute('href') || im.getAttribute('xlink:href'), null, board);
      }
      if (deep) {
        for (const el of root.querySelectorAll('*')) {
          const bg = getComputedStyle(el).backgroundImage;
          if (bg && bg !== 'none') for (const m of bg.matchAll(/url\(["']?(.*?)["']?\)/g)) addImage(m[1], null, board);
        }
      }
    }
    captureText(board);
  }

  function captureText(board) {
    const text = document.body ? document.body.innerText : '';
    if (!text) return;
    let lines = boardText.get(board);
    if (!lines) boardText.set(board, (lines = new Set()));
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (t) lines.add(t);
    }
  }

  // ---------------------------------------------------------- image checks

  async function sniff(blob) {
    const b = new Uint8Array(await blob.slice(0, 1024).arrayBuffer());
    const at = (i, ...xs) => xs.every((x, j) => b[i + j] === x);
    let ext = null;
    if (at(0, 0x89, 0x50, 0x4e, 0x47)) ext = 'png';
    else if (at(0, 0xff, 0xd8, 0xff)) ext = 'jpg';
    else if (at(0, 0x47, 0x49, 0x46, 0x38)) ext = 'gif';
    else if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) ext = 'webp';
    else if (at(4, 0x66, 0x74, 0x79, 0x70)) {
      const brand = String.fromCharCode(...b.slice(8, 12));
      if (/^avi[fs]$/.test(brand)) ext = 'avif';
      else if (/^(heic|heix|mif1|msf1)$/.test(brand)) ext = 'heic';
    } else if (/<svg[\s>]/i.test(new TextDecoder().decode(b))) ext = 'svg';
    if (!ext && /^image\/(png|jpeg|gif|webp|avif|bmp)$/.test(blob.type)) ext = blob.type.slice(6).replace('jpeg', 'jpg');
    return ext ? { ext } : null;
  }

  async function dimensions(blob) {
    try {
      const bmp = await createImageBitmap(blob);
      const d = { width: bmp.width, height: bmp.height };
      bmp.close();
      return d;
    } catch {
      return { width: 0, height: 0 };
    }
  }

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  // ------------------------------------------------------------ downloads

  async function tryFetch(url) {
    const u = parseUrl(url);
    if (!u) return null;
    const local = u.protocol === 'blob:' || u.protocol === 'data:' || u.origin === location.origin;
    // A copy cached from a plain <img> load may lack the CORS header, so retry past the cache.
    const attempts = local ? [{}] : [
      { mode: 'cors', credentials: 'omit', cache: 'force-cache' },
      { mode: 'cors', credentials: 'omit', cache: 'reload' },
      { mode: 'cors', credentials: 'include', cache: 'reload' },
    ];
    for (const opts of attempts) {
      try {
        const r = await orig.fetch.call(window, url, opts);
        if (r.ok) {
          const b = await r.blob();
          if (b.size) return b;
        }
      } catch {}
    }
    return null;
  }

  async function resolveBlob(item) {
    const urls = [...item.urls];
    for (const up of new Set(urls.map(fullSizeUrl).filter(Boolean))) {
      const b = await tryFetch(up);
      if (b && (!item.blob || b.size >= item.blob.size)) return b;
    }
    if (item.blob) return item.blob;
    for (const u of urls) {
      const b = await tryFetch(u);
      if (b) return b;
    }
    return null;
  }

  async function pool(list, n, fn) {
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
      while (i < list.length) await fn(list[i++]);
    }));
  }

  async function canvasSnapshots() {
    const out = [];
    for (const root of roots()) {
      for (const c of root.querySelectorAll('canvas')) {
        if (Math.min(c.width, c.height) < settings.minSide) continue;
        try {
          const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
          if (blob && !(await isBlank(blob))) out.push(blob);
        } catch {} // cross-origin content makes a canvas unreadable; skip it
      }
    }
    return out;
  }

  async function isBlank(blob) {
    try {
      const bmp = await createImageBitmap(blob, { resizeWidth: 16, resizeHeight: 16 });
      const cv = document.createElement('canvas');
      cv.width = cv.height = 16;
      const ctx = cv.getContext('2d');
      ctx.drawImage(bmp, 0, 0);
      bmp.close();
      const px = ctx.getImageData(0, 0, 16, 16).data;
      for (let i = 4; i < px.length; i++) if (px[i] !== px[i % 4]) return false;
      return true;
    } catch {
      return false;
    }
  }

  // ------------------------------------------------------------------ ZIP

  class ZipWriter {
    constructor() {
      const d = new Date();
      this.time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
      this.date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
      this.parts = [];
      this.central = [];
      this.offset = 0;
      this.count = 0;
    }

    async add(name, data, knownCrc) {
      const blob = data instanceof Blob ? data : new Blob([data]);
      const crc = knownCrc ?? crc32(new Uint8Array(await blob.arrayBuffer()));
      const size = blob.size;
      const nameBytes = new TextEncoder().encode(name);
      const header = (sig, len) => {
        const v = new DataView(new ArrayBuffer(len));
        v.setUint32(0, sig, true);
        return v;
      };
      const loc = header(0x04034b50, 30);
      loc.setUint16(4, 20, true);
      loc.setUint16(6, 0x0800, true); // UTF-8 names
      loc.setUint16(10, this.time, true);
      loc.setUint16(12, this.date, true);
      loc.setUint32(14, crc, true);
      loc.setUint32(18, size, true);
      loc.setUint32(22, size, true);
      loc.setUint16(26, nameBytes.length, true);
      this.parts.push(loc.buffer, nameBytes, blob);

      const cen = header(0x02014b50, 46);
      cen.setUint16(4, 20, true);
      cen.setUint16(6, 20, true);
      cen.setUint16(8, 0x0800, true);
      cen.setUint16(12, this.time, true);
      cen.setUint16(14, this.date, true);
      cen.setUint32(16, crc, true);
      cen.setUint32(20, size, true);
      cen.setUint32(24, size, true);
      cen.setUint16(28, nameBytes.length, true);
      cen.setUint32(42, this.offset, true);
      this.central.push(cen.buffer, nameBytes);

      this.offset += 30 + nameBytes.length + size;
      this.count++;
    }

    finish() {
      const cenSize = this.central.reduce((n, p) => n + p.byteLength, 0);
      const end = new DataView(new ArrayBuffer(22));
      end.setUint32(0, 0x06054b50, true);
      end.setUint16(8, this.count, true);
      end.setUint16(10, this.count, true);
      end.setUint32(12, cenSize, true);
      end.setUint32(16, this.offset, true);
      return new Blob([...this.parts, ...this.central, end.buffer], { type: 'application/zip' });
    }
  }

  function saveBlob(blob, filename) {
    const a = document.createElement('a');
    a.href = orig.createObjectURL.call(URL, blob);
    a.download = filename;
    a.rel = 'noopener';
    ui.root.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 120000);
  }

  // --------------------------------------------------------------- export

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  function galleryHtml(saved, boards) {
    const sections = [...boards].map((board) => {
      const figs = saved.filter((s) => s.board === board).map((s) =>
        `<figure><a href="${esc(s.file)}"><img loading="lazy" src="${esc(s.file)}"></a>` +
        `<figcaption>${esc(s.file.split('/').pop())}${s.width ? ` · ${s.width}×${s.height}` : ''}</figcaption></figure>`).join('');
      const textFile = `boards/${safeName(board)}/board-text.txt`;
      return `<h2>${esc(board)}</h2><p><a href="${esc(textFile)}">Board text</a></p><div class="grid">${figs}</div>`;
    }).join('');
    return `<!doctype html><meta charset="utf-8"><title>Mixboard export</title>
<style>body{font:14px system-ui,sans-serif;margin:24px;background:#fafafa;color:#222}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
figure{margin:0;background:#fff;border:1px solid #ddd;border-radius:8px;padding:8px}
img{width:100%;height:220px;object-fit:contain;background:#eee;border-radius:4px}
figcaption{font-size:12px;color:#666;margin-top:4px;word-break:break-all}</style>
<h1>Mixboard export</h1><p>Exported ${esc(new Date().toString())}</p>${sections}`;
  }

  async function exportZip() {
    if (busy) return;
    busy = true;
    try {
      setStatus('Scanning page…');
      scanDom(true);
      const items = [...images.values()].sort((a, b) => a.seen - b.seen);
      const saved = [];
      const failed = [];
      const skipped = { small: 0, notImage: 0, duplicate: 0 };
      const seenContent = new Set();
      let done = 0;

      await pool(items, settings.concurrency, async (item) => {
        const blob = await resolveBlob(item);
        setStatus(`Downloading images… ${++done}/${items.length}`);
        if (!blob) { failed.push(item); return; }
        const kind = await sniff(blob);
        if (!kind || (kind.ext === 'svg' && !settings.includeSvg)) { skipped.notImage++; return; }
        const dim = kind.ext === 'svg' ? { width: 0, height: 0 } : await dimensions(blob);
        if (dim.width && Math.min(dim.width, dim.height) < settings.minSide) { skipped.small++; return; }
        const crc = crc32(new Uint8Array(await blob.arrayBuffer()));
        const sig = `${crc}:${blob.size}`;
        if (seenContent.has(sig)) { skipped.duplicate++; return; }
        seenContent.add(sig);
        saved.push({ item, blob, crc, ext: kind.ext, ...dim });
      });

      saved.sort((a, b) => a.item.seen - b.item.seen);
      const perBoard = new Map();
      for (const s of saved) {
        const n = (perBoard.get(s.item.board) || 0) + 1;
        perBoard.set(s.item.board, n);
        s.board = s.item.board;
        s.file = `boards/${safeName(s.board)}/${String(n).padStart(3, '0')}.${s.ext}`;
      }

      setStatus('Capturing canvas snapshots…');
      const snaps = await canvasSnapshots();

      const boards = new Set([...saved.map((s) => s.board), ...boardText.keys()]);
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      const manifest = {
        exportedAt: new Date().toISOString(),
        page: location.href,
        images: saved.map((s) => ({
          file: s.file, board: s.board, width: s.width, height: s.height, bytes: s.blob.size,
          sources: [...s.item.urls].filter((u) => !u.startsWith('data:')),
        })),
        failed: failed.map((f) => ({ board: f.board, urls: [...f.urls].filter((u) => /^https?:/.test(u)) })),
        skipped,
        apiResponses: apiLog.length,
        apiResponsesDropped: apiDropped,
      };

      const entries = [];
      entries.push(['README.txt', [
        'Mixboard export', '',
        'index.html            Open in a browser to see every saved image, grouped by board.',
        'boards/<board>/       The images (original files, numbered in the order they were seen)',
        '                      plus board-text.txt with the text that was on screen (titles, notes, prompts).',
        'canvas-snapshots/     PNG snapshots of drawing canvases on the page, if any.',
        'api/                  Raw data the Mixboard app loaded (board layouts, prompts, image lists).',
        'manifest.json         Which file came from which URL.',
        'failed-urls.txt       Images the browser was not allowed to re-download (see README of the tool).',
        '', 'The api/ folder may contain account identifiers; do not share it publicly.',
      ].join('\n')]);
      entries.push(['index.html', galleryHtml(saved, boards)]);
      entries.push(['manifest.json', JSON.stringify(manifest, null, 2)]);
      const failedUrls = manifest.failed.map((f) => f.urls[0]).filter(Boolean);
      if (failedUrls.length) entries.push(['failed-urls.txt', failedUrls.join('\n') + '\n']);
      for (const [board, lines] of boardText) {
        entries.push([`boards/${safeName(board)}/board-text.txt`, [...lines].join('\n') + '\n']);
      }
      snaps.forEach((b, i) => entries.push([`canvas-snapshots/${safeName(currentBoard())}-${i + 1}.png`, b]));
      if (apiLog.length) {
        entries.push(['api/index.json', JSON.stringify(apiLog.map((a, i) => ({
          file: apiFileName(a, i), time: a.time, method: a.method, url: a.url, status: a.status, type: a.type, board: a.board,
        })), null, 2)]);
        apiLog.forEach((a, i) => entries.push([apiFileName(a, i), a.data]));
      }
      for (const s of saved) entries.push([s.file, s.blob, s.crc]);

      setStatus('Building ZIP…');
      const parts = [];
      let zip = new ZipWriter();
      for (const [name, data, crc] of entries) {
        const size = data instanceof Blob ? data.size : data.length * 3;
        if (zip.count && zip.offset + size > settings.zipPartBytes) {
          parts.push(zip.finish());
          zip = new ZipWriter();
        }
        await zip.add(name, data, crc);
      }
      parts.push(zip.finish());

      const base = `mixboard-export-${safeName(currentBoard(), 40).replace(/\s+/g, '-')}-${stamp}`;
      for (let i = 0; i < parts.length; i++) {
        saveBlob(parts[i], parts.length > 1 ? `${base}-part${i + 1}.zip` : `${base}.zip`);
        if (i < parts.length - 1) await new Promise((r) => setTimeout(r, 1500));
      }
      exportedCount = images.size;
      const mb = (parts.reduce((n, p) => n + p.size, 0) / 1048576).toFixed(1);
      setStatus(`Saved ${saved.length} images (${mb} MB)` +
        (failed.length ? ` · ${failed.length} could not be downloaded (see failed-urls.txt)` : '') +
        ` · skipped ${skipped.small} small, ${skipped.duplicate} duplicates`);
      console.log('[Mixboard Exporter] done', manifest);
    } catch (err) {
      console.error('[Mixboard Exporter]', err);
      setStatus('Export failed: ' + (err && err.message ? err.message : err));
    } finally {
      busy = false;
    }
  }

  function apiFileName(a, i) {
    const u = parseUrl(a.url);
    const rpc = u && u.searchParams.get('rpcids');
    const where = u ? u.pathname.split('/').filter(Boolean).slice(-2).join('_').replace(/\.\w+$/, '') : 'response';
    const slug = safeName([where, rpc].filter(Boolean).join('_'), 60);
    const ext = typeof a.data === 'string' ? (/json/.test(a.type) ? 'json' : 'txt') : 'bin';
    return `api/${String(i + 1).padStart(4, '0')}_${slug}.${ext}`;
  }

  // ------------------------------------------------------------------- UI

  const ui = {};

  function el(tag, style, props, children) {
    const e = document.createElement(tag);
    if (style) Object.assign(e.style, style);
    if (props) Object.assign(e, props);
    for (const c of children || []) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    return e;
  }

  function button(label, primary, onClick) {
    const b = el('button', {
      font: 'inherit', padding: '7px 12px', borderRadius: '8px', cursor: 'pointer',
      border: primary ? '0' : '1px solid #5f6368', background: primary ? '#8ab4f8' : 'transparent',
      color: primary ? '#202124' : '#e8eaed', fontWeight: primary ? '600' : '400',
    }, { textContent: label, type: 'button' });
    b.addEventListener('click', onClick);
    return b;
  }

  function buildPanel() {
    const host = el('div', { position: 'fixed', right: '16px', bottom: '16px', zIndex: '2147483647' });
    host.id = 'mixboard-exporter';
    const root = host.attachShadow({ mode: 'open' });
    ui.host = host;
    ui.root = root;

    ui.stats = el('div', { margin: '6px 0', color: '#bdc1c6' });
    ui.board = el('input', {
      width: '100%', boxSizing: 'border-box', margin: '4px 0 8px', padding: '6px 8px', borderRadius: '6px',
      border: '1px solid #5f6368', background: '#303134', color: '#e8eaed', font: 'inherit',
    }, { placeholder: 'auto: page title' });
    ui.board.addEventListener('input', () => { boardOverride = ui.board.value.trim(); render(); });
    ui.minSide = el('input', {
      width: '64px', padding: '4px 6px', borderRadius: '6px', border: '1px solid #5f6368',
      background: '#303134', color: '#e8eaed', font: 'inherit',
    }, { type: 'number', min: '0', value: String(settings.minSide) });
    ui.minSide.addEventListener('change', () => { settings.minSide = Math.max(0, +ui.minSide.value || 0); });
    ui.status = el('div', { marginTop: '8px', color: '#fdd663', minHeight: '1em', whiteSpace: 'pre-wrap' });

    ui.card = el('div', {
      width: '320px', padding: '12px 14px', borderRadius: '12px', background: '#202124', color: '#e8eaed',
      font: '13px/1.4 system-ui, -apple-system, Segoe UI, Roboto, sans-serif', boxShadow: '0 8px 24px rgba(0,0,0,.35)',
    }, null, [
      el('div', { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, null, [
        el('strong', { fontSize: '14px' }, { textContent: 'Mixboard Exporter' }),
        button('–', false, () => toggle(false)),
      ]),
      ui.stats,
      el('div', { color: '#9aa0a6' }, {
        textContent: 'Open each board and zoom out until every image has loaded; images are collected as they appear. Then click Download ZIP.',
      }),
      el('label', { display: 'block', marginTop: '8px' }, { textContent: 'Folder for images seen from now on:' }),
      ui.board,
      el('label', { display: 'block' }, null, ['Skip images smaller than ', ui.minSide, ' px']),
      el('div', { display: 'flex', gap: '8px', marginTop: '10px' }, null, [
        button('Scan page', false, () => { scanDom(true); setStatus('Scanned.'); }),
        button('Download ZIP', true, exportZip),
      ]),
      ui.status,
    ]);
    ui.pill = button('', true, () => toggle(true));
    ui.pill.style.display = 'none';
    root.append(ui.card, ui.pill);
    document.documentElement.appendChild(host);
    render();
  }

  function toggle(open) {
    ui.card.style.display = open ? 'block' : 'none';
    ui.pill.style.display = open ? 'none' : 'block';
    render();
  }

  function show() {
    if (!ui.host || !ui.host.isConnected) buildPanel();
    toggle(true);
  }

  let renderTimer = 0;
  function scheduleRender() {
    if (!renderTimer) renderTimer = setTimeout(render, 300);
  }

  function render() {
    renderTimer = 0;
    if (!ui.stats) return;
    ui.stats.textContent = `Images found: ${images.size} · Data responses: ${apiLog.length}` +
      (apiDropped ? ` (+${apiDropped} over limit)` : '') + `\nCurrent folder: ${currentBoard()}`;
    ui.stats.style.whiteSpace = 'pre-wrap';
    ui.pill.textContent = `Mixboard Exporter (${images.size})`;
  }

  function setStatus(msg) {
    if (ui.status) ui.status.textContent = msg;
  }

  // ---------------------------------------------------------------- start

  function start() {
    buildPanel();
    scanDom(true);
    setInterval(() => {
      if (!busy) scanDom(false);
      if (ui.host && !ui.host.isConnected) document.documentElement.appendChild(ui.host);
    }, settings.scanIntervalMs);
  }

  window.addEventListener('beforeunload', (e) => {
    if (images.size > exportedCount) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  window.__mixboardExporter = { show, exportZip, scan: () => scanDom(true), images, apiLog, boardText, settings };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  console.log('[Mixboard Exporter] ready. Open your boards, then click "Download ZIP" in the panel (bottom-right).');
})();
