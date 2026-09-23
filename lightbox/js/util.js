/* Lightbox — shared helpers. Classic script: everything hangs off window.LB so
   the app also runs when index.html is opened straight from disk (file://). */
(function () {
  'use strict';
  const LB = (window.LB = window.LB || {});

  LB.uid = (prefix = '') =>
    prefix + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  LB.clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  LB.$ = (sel, root = document) => root.querySelector(sel);
  LB.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  LB.debounce = function (fn, ms) {
    let t = null;
    const wrapped = (...args) => {
      clearTimeout(t);
      t = setTimeout(() => { t = null; fn(...args); }, ms);
    };
    wrapped.flush = () => { if (t) { clearTimeout(t); t = null; fn(); } };
    return wrapped;
  };

  LB.escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  LB.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------- element builder ---------- */
  LB.h = function (tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  };

  /* ---------- icons (24px grid, stroked) ---------- */
  const I = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
    copy: '<rect x="8" y="8" width="14" height="14" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    sparkles: '<path d="M11 3.5 12.9 8.6 18 10.5l-5.1 1.9L11 17.5l-1.9-5.1L4 10.5l5.1-1.9z"/><path d="m18.5 15 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
    wand: '<path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2 19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/>',
    pencil: '<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
    palette: '<circle cx="13.5" cy="6.5" r="1.1" fill="currentColor"/><circle cx="17.5" cy="10.5" r="1.1" fill="currentColor"/><circle cx="8.5" cy="7.5" r="1.1" fill="currentColor"/><circle cx="6.5" cy="12.5" r="1.1" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.84-.44-1.13-.29-.29-.44-.65-.44-1.13a1.64 1.64 0 0 1 1.67-1.67h2c3.05 0 5.56-2.5 5.56-5.55C21.97 6.01 17.46 2 12 2z"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
    type: '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
    sticky: '<path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z"/><path d="M15 3v6h6"/>',
    hand: '<path d="M18 11V6a2 2 0 0 0-4 0"/><path d="M14 10V4a2 2 0 0 0-4 0v2"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
    pointer: '<path d="M4.04 4.69a.5.5 0 0 1 .65-.65l16 6.5a.5.5 0 0 1-.06.95l-6.12 1.58a2 2 0 0 0-1.44 1.44l-1.58 6.12a.5.5 0 0 1-.95.06z"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    chevronLeft: '<path d="m15 18-6-6 6-6"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    fit: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
    send: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    combine: '<circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/>',
    doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8M16 17H8M10 9H8"/>',
    more: '<circle cx="5" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="19" cy="12" r="1.2" fill="currentColor"/>',
    external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    expand: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    bringFront: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/>',
  };
  LB.icon = (name, cls = '') =>
    `<svg class="ic ${cls}" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[name] || ''}</svg>`;
  LB.hydrateIcons = (root = document) => {
    LB.$$('[data-icon]', root).forEach((el) => {
      el.insertAdjacentHTML('afterbegin', LB.icon(el.dataset.icon));
      el.removeAttribute('data-icon');
    });
  };

  /* ---------- blobs & images ---------- */
  LB.blobToDataURL = (blob) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  LB.blobToBase64 = async (blob) => (await LB.blobToDataURL(blob)).split(',')[1];
  LB.base64ToBlob = (b64, mime = 'image/png') => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  };
  LB.dataURLToBlob = (url) => {
    const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url);
    if (!m) throw new Error('Not a data URL');
    return m[2] ? LB.base64ToBlob(m[3], m[1]) : new Blob([decodeURIComponent(m[3])], { type: m[1] || 'text/plain' });
  };

  LB.loadBitmap = async (blob) => {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(blob); } catch (e) { /* fall through to <img> */ }
    }
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };
  LB.imageSize = async (blob) => {
    const bmp = await LB.loadBitmap(blob);
    const size = { w: bmp.width || bmp.naturalWidth, h: bmp.height || bmp.naturalHeight };
    if (bmp.close) bmp.close();
    return size;
  };

  /* Downscale + re-encode an image before sending it to the API, so a 12 MP
     upload doesn't turn into a 20 MB request. Cached per Blob. */
  const apiCache = new WeakMap();
  LB.prepareImageForApi = async (blob, maxSide = 1536) => {
    const cached = apiCache.get(blob);
    if (cached && cached.maxSide === maxSide) return cached.part;
    const bmp = await LB.loadBitmap(blob);
    const w0 = bmp.width || bmp.naturalWidth, h0 = bmp.height || bmp.naturalHeight;
    let part;
    if (Math.max(w0, h0) <= maxSide && /image\/(png|jpeg|webp)/.test(blob.type) && blob.size < 4e6) {
      part = { mimeType: blob.type, data: await LB.blobToBase64(blob) };
    } else {
      const s = Math.min(1, maxSide / Math.max(w0, h0));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w0 * s));
      c.height = Math.max(1, Math.round(h0 * s));
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(bmp, 0, 0, c.width, c.height);
      const out = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
      part = { mimeType: 'image/jpeg', data: await LB.blobToBase64(out) };
    }
    if (bmp.close) bmp.close();
    apiCache.set(blob, { maxSide, part });
    return part;
  };

  /* Supported Gemini aspect ratios, and the closest one to a w/h pair. */
  LB.RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];
  LB.ratioValue = (r) => { const [a, b] = r.split(':').map(Number); return a / b; };
  LB.nearestRatio = (w, h) => {
    const v = w / h;
    let best = '1:1', bd = Infinity;
    for (const r of LB.RATIOS) {
      const d = Math.abs(Math.log(LB.ratioValue(r) / v));
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  };
  /* On-canvas size for an image: equal area regardless of shape. */
  LB.displaySize = (ratio, area = 340) => {
    const s = Math.sqrt(ratio);
    return { w: Math.round(area * s), h: Math.round(area / s) };
  };

  /* ---------- colour palette via k-means ---------- */
  LB.extractPalette = async (blob, k = 5) => {
    const bmp = await LB.loadBitmap(blob);
    const W = bmp.width || bmp.naturalWidth, H = bmp.height || bmp.naturalHeight;
    const s = Math.min(1, 80 / Math.max(W, H));
    const w = Math.max(1, Math.round(W * s)), h = Math.max(1, Math.round(H * s));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();
    const d = ctx.getImageData(0, 0, w, h).data;
    const px = [];
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) px.push([d[i], d[i + 1], d[i + 2]]);
    if (!px.length) return [];
    const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
    // Seed with the mean colour, then farthest-point picks so accents survive.
    const mean = [0, 1, 2].map((j) => px.reduce((t, p) => t + p[j], 0) / px.length);
    const cents = [mean];
    while (cents.length < k) {
      let best = null, bestD = -1;
      for (let i = 0; i < px.length; i += 2) {
        let md = Infinity;
        for (const c0 of cents) md = Math.min(md, d2(px[i], c0));
        if (md > bestD) { bestD = md; best = px[i]; }
      }
      if (!best || bestD < 64) break;
      cents.push(best.slice());
    }
    const counts = new Array(cents.length).fill(0);
    for (let it = 0; it < 14; it++) {
      const sums = cents.map(() => [0, 0, 0]);
      counts.fill(0);
      for (const p of px) {
        let bi = 0, bd = Infinity;
        for (let j = 0; j < cents.length; j++) { const dd = d2(p, cents[j]); if (dd < bd) { bd = dd; bi = j; } }
        sums[bi][0] += p[0]; sums[bi][1] += p[1]; sums[bi][2] += p[2]; counts[bi]++;
      }
      cents.forEach((c0, j) => { if (counts[j]) for (let q = 0; q < 3; q++) c0[q] = sums[j][q] / counts[j]; });
    }
    const hex = (c0) => '#' + c0.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
    return cents
      .map((c0, j) => ({ c0, n: counts[j] }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)
      .map((x) => hex(x.c0));
  };
  LB.inkFor = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 150 ? '#16181b' : '#ffffff';
  };

  /* ---------- tiny markdown for notes ---------- */
  function inline(s) {
    return s
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
      .replace(/(^|[^&\w])#([0-9a-fA-F]{6})\b/g, '$1<span class="sw" style="background:#$2"></span>#$2');
  }
  LB.renderMarkdown = (src) => {
    const lines = LB.escapeHtml(src || '').split('\n');
    let html = '', list = false, gap = false;
    const close = () => { if (list) { html += '</ul>'; list = false; } };
    for (const raw of lines) {
      const line = raw.trimEnd();
      let m;
      if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) {
        close();
        html += m[1].length === 1 ? `<h4>${inline(m[2])}</h4>` : `<h5>${inline(m[2])}</h5>`;
        gap = false;
      } else if ((m = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line))) {
        if (!list) { html += '<ul>'; list = true; }
        html += `<li>${inline(m[1])}</li>`;
        gap = false;
      } else if (!line.trim()) {
        close();
        if (!gap && html) html += '<div class="md-gap"></div>';
        gap = true;
      } else {
        close();
        html += `<p>${inline(line)}</p>`;
        gap = false;
      }
    }
    close();
    return html;
  };
  /* Markdown → [{kind:'h1'|'h2'|'li'|'p'|'gap', text}] for the PNG exporter. */
  LB.markdownBlocks = (src) =>
    (src || '').split('\n').map((line) => {
      const t = line.trimEnd();
      let m;
      if ((m = /^(#{1,3})\s+(.*)$/.exec(t))) return { kind: m[1].length === 1 ? 'h1' : 'h2', text: m[2] };
      if ((m = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(t))) return { kind: 'li', text: m[1] };
      if (!t.trim()) return { kind: 'gap', text: '' };
      return { kind: 'p', text: t };
    }).map((b) => ({ ...b, text: b.text.replace(/\*\*|`/g, '').replace(/(^|\s)\*(\S)/g, '$1$2') }));

  /* ---------- misc ---------- */
  LB.timeAgo = (ts) => {
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 45) return 'just now';
    const m = Math.round(s / 60);
    if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} h ago`;
    const d = Math.round(h / 24);
    if (d < 14) return `${d} d ago`;
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };
  LB.pad2 = (n) => String(n).padStart(2, '0');
  LB.slug = (s) => (s || 'board').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'board';
  LB.extFor = (mime) => ({ 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/png': 'png' }[mime] || 'png');

  LB.downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = LB.h('a', { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  LB.copyText = async (text) => {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { return false; }
  };

  /* ---------- toasts ---------- */
  LB.toast = (message, opts = {}) => {
    const host = LB.$('#toasts');
    if (!host) return;
    const el = LB.h('div', { class: 'toast' + (opts.type === 'error' ? ' is-error' : ''), role: opts.type === 'error' ? 'alert' : 'status' },
      LB.h('span', { class: 'toast-msg' }, message));
    if (opts.action) {
      el.append(LB.h('button', { class: 'toast-act', type: 'button', onclick: () => { opts.action.fn(); dismiss(); } }, opts.action.label));
    }
    el.append(LB.h('button', { class: 'toast-x', type: 'button', 'aria-label': 'Dismiss', html: LB.icon('x'), onclick: () => dismiss() }));
    host.append(el);
    const dismiss = () => { el.classList.add('is-leaving'); setTimeout(() => el.remove(), 180); };
    const ms = opts.timeout ?? (opts.type === 'error' ? 9000 : 3800);
    if (ms) setTimeout(dismiss, ms);
    while (host.children.length > 4) host.firstChild.remove();
    return dismiss;
  };

  /* ---------- store-only ZIP writer (images are already compressed) ---------- */
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc32 = (bytes) => {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  LB.makeZip = async (files) => {
    const enc = new TextEncoder();
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const chunks = [], central = [];
    let offset = 0;
    for (const f of files) {
      const data = new Uint8Array(await f.blob.arrayBuffer());
      const name = enc.encode(f.name);
      const crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(8, 0, true); lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      chunks.push(lh, name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, dosTime, true);
      ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true);
      ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);
      central.push(ch, name);
      offset += 30 + name.length + data.length;
    }
    const cdSize = central.reduce((t, c) => t + c.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob([...chunks, ...central, end], { type: 'application/zip' });
  };
})();
