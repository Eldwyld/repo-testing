/* Lightbox — the infinite canvas: camera, rendering, selection, dragging,
   resizing, marquee, pinch-zoom, note editing, undo/redo and autosave. */
(function () {
  'use strict';
  const LB = window.LB;
  const S = (LB.state = {
    board: null,
    selection: new Set(),
    ghosts: [],
    tool: 'select',
    undo: [],
    redo: [],
    editingId: null,
  });

  const els = {};
  const nodes = new Map(); // item id -> element
  const pointers = new Map();
  const MIN_Z = 0.08, MAX_Z = 5;
  let cam = { x: 0, y: 0, z: 1 }; // screen = world * z + (x, y)
  let drag = null;
  let spaceDown = false;
  let camAnim = 0;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- geometry ---------- */
  function bounds(list) {
    if (!list.length) return null;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const r of list) {
      x1 = Math.min(x1, r.x); y1 = Math.min(y1, r.y);
      x2 = Math.max(x2, r.x + r.w); y2 = Math.max(y2, r.y + r.h);
    }
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
  const overlaps = (a, b, gap = 0) =>
    a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
  const padRect = (r, p) => ({ x: r.x - p, y: r.y - p, w: r.w + p * 2, h: r.h + p * 2 });

  const s2w = (sx, sy) => ({ x: (sx - cam.x) / cam.z, y: (sy - cam.y) / cam.z });
  const w2s = (wx, wy) => ({ x: wx * cam.z + cam.x, y: wy * cam.z + cam.y });
  function clientToWorld(cx, cy) {
    const r = els.viewport.getBoundingClientRect();
    return s2w(cx - r.left, cy - r.top);
  }

  /* The part of the screen not covered by floating chrome. */
  function safeArea() {
    const vw = els.viewport.clientWidth || window.innerWidth;
    const vh = els.viewport.clientHeight || window.innerHeight;
    const narrow = vw < 720;
    const prompt = LB.$('#prompt');
    return {
      vw, vh,
      left: narrow ? 16 : 84,
      right: narrow ? 16 : 32,
      top: 76,
      bottom: (prompt ? prompt.offsetHeight : 110) + 40,
    };
  }
  function visibleWorldRect() {
    const a = safeArea();
    const tl = s2w(a.left, a.top), br = s2w(a.vw - a.right, a.vh - a.bottom);
    return { x: tl.x, y: tl.y, w: Math.max(1, br.x - tl.x), h: Math.max(1, br.y - tl.y) };
  }
  function viewCenter() {
    const v = visibleWorldRect();
    return { x: v.x + v.w / 2, y: v.y + v.h / 2 };
  }

  /* ---------- camera ---------- */
  function applyCamera() {
    els.world.style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})`;
    els.world.style.setProperty('--inv', String(1 / cam.z));
    let step = 24;
    while (step * cam.z < 14) step *= 4;
    const g = step * cam.z;
    els.viewport.style.backgroundSize = `${g}px ${g}px`;
    els.viewport.style.backgroundPosition = `${cam.x}px ${cam.y}px`;
    if (els.zoomLabel) els.zoomLabel.textContent = Math.round(cam.z * 100) + '%';
    if (S.board) { S.board.camera = { ...cam }; saveSoon(); }
    positionCtx();
  }
  function setCamera(target, animate = true) {
    cancelAnimationFrame(camAnim);
    if (!animate || reduceMotion.matches) { cam = { ...target }; applyCamera(); return; }
    const from = { ...cam }, t0 = performance.now(), dur = 340;
    const lz0 = Math.log(from.z), lz1 = Math.log(target.z);
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 3);
      cam = { x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, z: Math.exp(lz0 + (lz1 - lz0) * e) };
      applyCamera();
      if (t < 1) camAnim = requestAnimationFrame(step);
    };
    camAnim = requestAnimationFrame(step);
  }
  function cameraFor(rect, maxZ = 1) {
    const a = safeArea();
    const aw = Math.max(80, a.vw - a.left - a.right), ah = Math.max(80, a.vh - a.top - a.bottom);
    const z = LB.clamp(Math.min(aw / Math.max(rect.w, 1), ah / Math.max(rect.h, 1), maxZ), MIN_Z, MAX_Z);
    return { z, x: a.left + (aw - rect.w * z) / 2 - rect.x * z, y: a.top + (ah - rect.h * z) / 2 - rect.y * z };
  }
  function fitTo(rect, { maxZ = 1, animate = true } = {}) {
    if (rect) setCamera(cameraFor(padRect(rect, 32), maxZ), animate);
  }
  function fitAll(animate = true) {
    const b = bounds(renderables());
    if (b) fitTo(b, { animate });
    else {
      const a = safeArea();
      setCamera({ z: 1, x: a.vw / 2, y: (a.top + a.vh - a.bottom) / 2 }, animate);
    }
  }
  /* Pan (and only zoom out if needed) so a world rect is on screen. */
  function ensureVisible(rect) {
    const v = visibleWorldRect();
    if (rect.x >= v.x && rect.y >= v.y && rect.x + rect.w <= v.x + v.w && rect.y + rect.h <= v.y + v.h) return;
    setCamera(cameraFor(padRect(rect, 32), cam.z));
  }
  function zoomAt(z, sx, sy) {
    z = LB.clamp(z, MIN_Z, MAX_Z);
    cam = { z, x: sx - (sx - cam.x) * (z / cam.z), y: sy - (sy - cam.y) * (z / cam.z) };
    applyCamera();
  }
  function zoomBy(f) {
    const a = safeArea();
    const sx = a.vw / 2, sy = (a.top + a.vh - a.bottom) / 2;
    const z = LB.clamp(cam.z * f, MIN_Z, MAX_Z);
    setCamera({ z, x: sx - (sx - cam.x) * (z / cam.z), y: sy - (sy - cam.y) * (z / cam.z) });
  }

  /* ---------- persistence ---------- */
  function setStatus(s) {
    const el = LB.$('#save-status');
    if (!el) return;
    el.dataset.state = s;
    el.textContent = s === 'saving' ? 'Saving…' : s === 'error' ? 'Not saved' : LB.store.persistent ? 'Saved' : 'Not stored';
  }
  async function saveNow() {
    const b = S.board;
    if (!b) return;
    setStatus('saving');
    try {
      await LB.store.putBoard(b);
      setStatus('saved');
    } catch (e) {
      setStatus('error');
      LB.toast(`Couldn’t save this board: ${e.message}`, { type: 'error' });
    }
  }
  const saveSoon = LB.debounce(saveNow, 450);

  /* ---------- history ---------- */
  const snapshot = () => JSON.stringify(S.board.items);
  function checkpoint() {
    if (!S.board) return;
    S.undo.push(snapshot());
    if (S.undo.length > 150) S.undo.shift();
    S.redo.length = 0;
    updateHistoryButtons();
  }
  function restore(snap) {
    S.board.items = JSON.parse(snap);
    const ids = new Set(S.board.items.map((i) => i.id));
    S.selection = new Set([...S.selection].filter((id) => ids.has(id)));
    changed();
    selectionChanged();
  }
  function undo() {
    if (!S.board || !S.undo.length) return;
    finishEdit();
    S.redo.push(snapshot());
    restore(S.undo.pop());
  }
  function redo() {
    if (!S.board || !S.redo.length) return;
    S.undo.push(snapshot());
    restore(S.redo.pop());
  }
  function updateHistoryButtons() {
    const u = LB.$('#btn-undo'), r = LB.$('#btn-redo');
    if (u) u.disabled = !S.undo.length;
    if (r) r.disabled = !S.redo.length;
  }
  function changed() {
    if (!S.board) return;
    S.board.updatedAt = Date.now();
    render();
    saveSoon();
    updateHistoryButtons();
  }

  /* ---------- items ---------- */
  const renderables = () => (S.board ? [...S.board.items, ...S.ghosts.filter((g) => g.boardId === S.board.id)] : []);
  const getItem = (id) => (S.board ? S.board.items.find((i) => i.id === id) : null);
  const selectedItems = () => (S.board ? S.board.items.filter((i) => S.selection.has(i.id)) : []);

  function addItems(items, { select = true, history = true } = {}) {
    if (!S.board || !items.length) return;
    if (history) checkpoint();
    for (const it of items) {
      if (it.type === 'image' && !it.frame) {
        S.board.nextFrame = S.board.nextFrame || 1;
        it.frame = S.board.nextFrame++;
      }
    }
    S.board.items.push(...items);
    if (select) S.selection = new Set(items.map((i) => i.id));
    changed();
    selectionChanged();
  }
  function removeItems(ids) {
    if (!S.board || !ids.length) return;
    const set = new Set(ids);
    if (S.editingId && set.has(S.editingId)) { S.editingId = null; }
    checkpoint();
    S.board.items = S.board.items.filter((i) => !set.has(i.id));
    ids.forEach((id) => S.selection.delete(id));
    changed();
    selectionChanged();
  }
  function bringToFront(ids) {
    const set = new Set(ids);
    const moving = S.board.items.filter((i) => set.has(i.id));
    S.board.items = S.board.items.filter((i) => !set.has(i.id)).concat(moving);
  }
  function sendToBack(ids) {
    const set = new Set(ids);
    const moving = S.board.items.filter((i) => set.has(i.id));
    S.board.items = moving.concat(S.board.items.filter((i) => !set.has(i.id)));
  }
  function duplicate(ids) {
    const src = ids.map(getItem).filter(Boolean);
    if (!src.length) return;
    const copies = src.map((it) => {
      const c = JSON.parse(JSON.stringify(it));
      c.id = LB.uid(it.type[0] + '_');
      c.x += 32; c.y += 32;
      delete c.frame;
      if (c.type === 'image' && it.frame) c.parentFrames = [it.frame];
      return c;
    });
    addItems(copies);
  }
  function tidy(ids) {
    const list = ids.map(getItem).filter(Boolean).sort((a, b) => a.y - b.y || a.x - b.x);
    if (list.length < 2) return;
    checkpoint();
    const b = bounds(list), gap = 24;
    const area = list.reduce((t, i) => t + (i.w + gap) * (i.h + gap), 0);
    const maxW = Math.max(Math.sqrt(area) * 1.5, ...list.map((i) => i.w));
    let x = b.x, y = b.y, rowH = 0;
    for (const it of list) {
      if (x > b.x && x + it.w > b.x + maxW) { x = b.x; y += rowH + gap; rowH = 0; }
      it.x = Math.round(x); it.y = Math.round(y);
      x += it.w + gap;
      rowH = Math.max(rowH, it.h);
    }
    changed();
  }

  /* Find the free spot nearest `start` for a w×h box, preferring right/down. */
  function findSpot(w, h, start, occ = renderables().map(({ x, y, w: ow, h: oh }) => ({ x, y, w: ow, h: oh })), gap = 24) {
    const free = (x, y) => { const r = { x, y, w, h }; return !occ.some((o) => overlaps(r, o, gap)); };
    const sx = Math.round(start.x), sy = Math.round(start.y);
    if (free(sx, sy)) return { x: sx, y: sy };
    const step = 24;
    for (let ring = 1; ring < 160; ring++) {
      let best = null, bestD = Infinity;
      for (let i = -ring; i <= ring; i++) {
        for (const [gx, gy] of [[i, -ring], [i, ring], [-ring, i], [ring, i]]) {
          const d = Math.hypot(gx, gy * 1.25) + (gx < 0 ? 0.6 : 0) + (gy < 0 ? 0.4 : 0);
          if (d >= bestD) continue;
          const x = sx + gx * step, y = sy + gy * step;
          if (free(x, y)) { best = { x, y }; bestD = d; }
        }
      }
      if (best) return best;
    }
    return { x: sx, y: sy };
  }

  /* ---------- ghosts (in-flight generations) ---------- */
  function addGhost(g) { S.ghosts.push(g); render(); }
  function removeGhost(g) { S.ghosts = S.ghosts.filter((x) => x !== g); render(); }

  /* ---------- rendering ---------- */
  function frameCode(it) {
    if (!it.frame) return '';
    let s = LB.pad2(it.frame);
    if (it.parentFrames && it.parentFrames.length) s += ' ← ' + it.parentFrames.map(LB.pad2).join(' + ');
    if (it.source === 'upload') s += ' · yours';
    return s;
  }

  function createNode(it) {
    const el = LB.h('div', { class: `item item-${it.type}`, dataset: { id: it.id, type: it.type } });
    const handle = () => LB.h('div', { class: 'handle', dataset: { handle: 'se' }, 'aria-hidden': 'true' });
    if (it.type === 'image') {
      el.append(LB.h('img', { alt: '', draggable: 'false', decoding: 'async' }), LB.h('div', { class: 'frame-code' }), handle());
    } else if (it.type === 'note') {
      el.append(LB.h('div', { class: 'note-body' }), handle());
    } else if (it.type === 'palette') {
      el.append(LB.h('div', { class: 'swatches' }), handle());
    } else if (it.type === 'ghost') {
      el.append(
        LB.h('div', { class: 'ghost-shine' }),
        LB.h('div', { class: 'ghost-meta' }, LB.h('span', { class: 'ghost-status' }), LB.h('p', { class: 'ghost-label' })),
        LB.h('div', { class: 'ghost-actions no-canvas' })
      );
    }
    return el;
  }

  function updateNode(el, it, i) {
    el.style.transform = `translate(${it.x}px, ${it.y}px)`;
    el.style.width = it.w + 'px';
    if (it.type !== 'note') el.style.height = it.h + 'px';
    el.style.zIndex = String(i + 1);
    el.classList.toggle('is-selected', S.selection.has(it.id));
    if (it.type === 'image') {
      const img = el.firstChild;
      if (img.dataset.blob !== it.blob) {
        img.dataset.blob = it.blob;
        const url = LB.store.cachedURL(it.blob);
        if (url) img.src = url;
        else {
          img.removeAttribute('src');
          LB.store.getURL(it.blob).then((u) => { if (u && img.dataset.blob === it.blob) img.src = u; });
        }
      }
      if (it.prompt) img.alt = it.prompt.slice(0, 180);
      const code = el.querySelector('.frame-code');
      const txt = frameCode(it);
      if (code.textContent !== txt) code.textContent = txt;
    } else if (it.type === 'note') {
      el.dataset.variant = it.variant || 'text';
      el.dataset.color = it.color || '';
      if (S.editingId !== it.id) {
        const body = el.querySelector('.note-body');
        if (body && el._text !== it.text) {
          body.innerHTML = LB.renderMarkdown(it.text) || '<p class="note-empty">Empty note</p>';
          el._text = it.text;
        }
      }
    } else if (it.type === 'palette') {
      const key = (it.colors || []).join(',');
      if (el._key !== key) {
        el._key = key;
        const sw = el.firstChild;
        sw.innerHTML = '';
        for (const c of it.colors || []) {
          sw.append(LB.h('div', { class: 'swatch', style: `background:${c};color:${LB.inkFor(c)}`, title: `Click to copy ${c}`, dataset: { hex: c } },
            LB.h('span', {}, c)));
        }
      }
    } else if (it.type === 'ghost') {
      el.dataset.status = it.status;
      el.dataset.kind = it.kind || 'image';
      const status = it.status === 'error' ? 'Didn’t develop' : it.status === 'queued' ? 'Queued' : it.kind === 'text' ? 'Writing…' : it.kind === 'plan' ? 'Planning…' : 'Developing…';
      el.querySelector('.ghost-status').textContent = status;
      el.querySelector('.ghost-label').textContent = it.status === 'error' ? it.error : it.label;
      const acts = el.querySelector('.ghost-actions');
      const key = it.status + (it.retry ? 'r' : '');
      if (acts._key !== key) {
        acts._key = key;
        acts.innerHTML = '';
        if (it.status === 'error') {
          if (it.retry) acts.append(LB.h('button', { type: 'button', class: 'ghost-btn', onclick: () => it.retry() }, 'Retry'));
          acts.append(LB.h('button', { type: 'button', class: 'ghost-btn', onclick: () => removeGhost(it) }, 'Dismiss'));
        } else {
          acts.append(LB.h('button', { type: 'button', class: 'ghost-btn is-icon', title: 'Cancel', 'aria-label': 'Cancel', html: LB.icon('x'), onclick: () => it.cancel && it.cancel() }));
        }
      }
    }
  }

  function render() {
    if (!S.board) return;
    const list = renderables();
    const seen = new Set();
    list.forEach((it, i) => {
      seen.add(it.id);
      let el = nodes.get(it.id);
      if (!el || el.dataset.type !== it.type) {
        if (el) el.remove();
        el = createNode(it);
        nodes.set(it.id, el);
        els.world.append(el);
      }
      updateNode(el, it, i);
    });
    for (const [id, el] of nodes) if (!seen.has(id)) { el.remove(); nodes.delete(id); }
    els.world.classList.toggle('single', S.selection.size === 1);
    for (const it of S.board.items) {
      if (it.type !== 'note') continue;
      const el = nodes.get(it.id);
      const h = el && el.offsetHeight;
      if (h && Math.abs(h - it.h) > 0.5) it.h = h;
    }
    if (els.empty) els.empty.hidden = list.length > 0;
    refreshCtx();
  }

  function clearNodes() {
    for (const el of nodes.values()) el.remove();
    nodes.clear();
  }

  /* ---------- selection & context toolbar ---------- */
  function selectionChanged() {
    for (const [id, el] of nodes) el.classList.toggle('is-selected', S.selection.has(id));
    els.world.classList.toggle('single', S.selection.size === 1);
    refreshCtx();
    if (LB.app && LB.app.onSelection) LB.app.onSelection();
  }
  function select(ids) {
    S.selection = new Set(ids);
    selectionChanged();
  }

  let ctxKey = '';
  function refreshCtx() {
    if (!els.ctx) return;
    const sel = selectedItems();
    const hide = !sel.length || S.editingId || (drag && (drag.moved || drag.mode === 'marquee'));
    if (hide) { els.ctx.hidden = true; ctxKey = ''; return; }
    const key = sel.map((i) => `${i.id}:${i.variant || ''}:${i.color || ''}`).join('|');
    if (key !== ctxKey) {
      ctxKey = key;
      els.ctx.innerHTML = '';
      LB.actions.ctxFor(sel).forEach((group, gi) => {
        if (gi) els.ctx.append(LB.h('span', { class: 'ctx-sep', 'aria-hidden': 'true' }));
        for (const b of group) els.ctx.append(b.el ? b.el() : ctxButton(b));
      });
    }
    els.ctx.hidden = false;
    positionCtx();
  }
  function ctxButton(b) {
    const el = LB.h('button', {
      type: 'button',
      class: 'ctx-btn' + (b.label ? ' has-label' : '') + (b.danger ? ' is-danger' : ''),
      title: b.title || b.label,
      'aria-label': b.title || b.label,
      html: LB.icon(b.icon) + (b.label ? `<span>${LB.escapeHtml(b.label)}</span>` : ''),
    });
    el.addEventListener('click', (e) => { e.stopPropagation(); b.run(el); });
    return el;
  }
  function positionCtx() {
    if (!els.ctx || els.ctx.hidden) return;
    const sel = selectedItems();
    if (!sel.length) return;
    const b = bounds(sel);
    const tl = w2s(b.x, b.y), br = w2s(b.x + b.w, b.y + b.h);
    const a = safeArea();
    const cw = els.ctx.offsetWidth, ch = els.ctx.offsetHeight;
    let x = (tl.x + br.x) / 2 - cw / 2;
    let y = tl.y - ch - 16;
    if (y < 64) y = br.y + 28;
    y = LB.clamp(y, 64, Math.max(64, a.vh - a.bottom - ch - 8));
    x = LB.clamp(x, 12, Math.max(12, a.vw - cw - 12));
    els.ctx.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  /* ---------- note editing ---------- */
  function startEdit(id, { fresh = false } = {}) {
    const it = getItem(id);
    const el = nodes.get(id);
    if (!it || it.type !== 'note' || !el) return;
    if (S.editingId) finishEdit();
    S.editingId = id;
    S.editBefore = snapshot();
    S.editFresh = fresh;
    el.classList.add('is-editing');
    const body = el.querySelector('.note-body');
    const ta = LB.h('textarea', { class: 'note-editor', spellcheck: 'true', 'aria-label': 'Note text', placeholder: 'Type a note…  # heading   - list' });
    ta.value = it.text || '';
    body.replaceWith(ta);
    const size = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
    ta.addEventListener('input', size);
    ta.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Escape' || (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey))) { ev.preventDefault(); ta.blur(); }
    });
    ta.addEventListener('blur', () => finishEdit());
    S.selection = new Set([id]);
    selectionChanged();
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(ta.value.length, ta.value.length);
    size();
    requestAnimationFrame(size);
  }
  function finishEdit() {
    const id = S.editingId;
    if (!id) return;
    S.editingId = null;
    const el = nodes.get(id);
    const ta = el && el.querySelector('.note-editor');
    const text = ta ? ta.value : null;
    if (el) {
      el.classList.remove('is-editing');
      if (ta) ta.replaceWith(LB.h('div', { class: 'note-body' }));
      el._text = undefined;
    }
    const it = getItem(id);
    if (!it || text == null) { render(); return; }
    if (!text.trim() && S.editFresh) {
      // A brand-new note left empty: drop it and its creation undo step.
      S.board.items = S.board.items.filter((i) => i.id !== id);
      S.selection.delete(id);
      S.undo.pop();
      render();
      saveSoon();
      updateHistoryButtons();
      selectionChanged();
      return;
    }
    if (text !== it.text) {
      if (!S.editFresh) { S.undo.push(S.editBefore); S.redo.length = 0; }
      it.text = text;
      changed();
    } else render();
  }
  function createNote(p, variant = 'text', text = '') {
    const sticky = variant === 'sticky';
    const it = {
      id: LB.uid('n_'), type: 'note', variant, text,
      color: sticky ? 'yellow' : undefined,
      x: Math.round(p.x), y: Math.round(p.y), w: sticky ? 240 : 320, h: 60,
      createdAt: Date.now(),
    };
    addItems([it]);
    if (!text) startEdit(it.id, { fresh: true });
    return it;
  }

  /* ---------- pointer input ---------- */
  function isTyping(e) {
    const t = e.target;
    return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  }

  function onPointerDown(e) {
    if (!S.board) return;
    const t = e.target;
    if (t.closest('.no-canvas') || t.closest('.note-editor') || e.button === 2) return;
    if (document.activeElement && document.activeElement !== els.viewport && document.activeElement.blur) document.activeElement.blur();
    els.viewport.focus({ preventScroll: true });
    if (LB.app && LB.app.closePopovers) LB.app.closePopovers();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { els.viewport.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (pointers.size === 2) { startPinch(); return; }
    if (pointers.size > 2) return;

    const itemEl = t.closest('.item');
    const pan = e.button === 1 || S.tool === 'hand' || spaceDown || (e.pointerType === 'touch' && !itemEl);
    if (pan) {
      drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false };
      els.viewport.classList.add('is-panning');
      return;
    }
    if (itemEl && itemEl.dataset.type === 'ghost') { drag = null; return; }
    if (itemEl) {
      const id = itemEl.dataset.id;
      const it = getItem(id);
      if (!it) return;
      if (t.closest('.handle') && S.selection.size === 1 && S.selection.has(id)) {
        drag = { mode: 'resize', id, sx: e.clientX, sy: e.clientY, ow: it.w, oh: it.h, moved: false };
        return;
      }
      const additive = e.shiftKey || e.metaKey || e.ctrlKey;
      let collapseTo = null, toggleOff = null;
      if (additive) { if (S.selection.has(id)) toggleOff = id; else S.selection.add(id); }
      else if (!S.selection.has(id)) S.selection = new Set([id]);
      else if (S.selection.size > 1) collapseTo = id;
      const orig = new Map();
      for (const sid of S.selection) { const si = getItem(sid); if (si) orig.set(sid, { x: si.x, y: si.y }); }
      drag = { mode: 'move', sx: e.clientX, sy: e.clientY, orig, moved: false, collapseTo, toggleOff, target: t };
      selectionChanged();
      return;
    }
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    const base = additive ? new Set(S.selection) : new Set();
    if (!additive && S.selection.size) { S.selection = new Set(); selectionChanged(); }
    drag = { mode: 'marquee', sx: e.clientX, sy: e.clientY, base, moved: false };
  }

  function onPointerMove(e) {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!drag) return;
    if (drag.mode === 'pinch') { updatePinch(); return; }
    const dxS = e.clientX - drag.sx, dyS = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dxS, dyS) < 3) return;
    const first = !drag.moved;
    drag.moved = true;
    if (drag.mode === 'pan') {
      cam = { ...cam, x: drag.cx + dxS, y: drag.cy + dyS };
      applyCamera();
      return;
    }
    const dx = dxS / cam.z, dy = dyS / cam.z;
    if (drag.mode === 'move') {
      if (first) {
        drag.toggleOff = null;
        drag.collapseTo = null;
        checkpoint();
        bringToFront([...drag.orig.keys()]);
        els.viewport.classList.add('is-dragging');
        render();
      }
      for (const [id, o] of drag.orig) {
        const it = getItem(id);
        if (!it) continue;
        it.x = Math.round(o.x + dx);
        it.y = Math.round(o.y + dy);
        const el = nodes.get(id);
        if (el) el.style.transform = `translate(${it.x}px, ${it.y}px)`;
      }
      return;
    }
    if (drag.mode === 'resize') {
      const it = getItem(drag.id);
      const el = nodes.get(drag.id);
      if (!it || !el) return;
      if (first) checkpoint();
      if (it.type === 'note') {
        it.w = Math.max(120, Math.round(drag.ow + dx));
        el.style.width = it.w + 'px';
      } else {
        const ratio = drag.ow / drag.oh;
        const d = Math.max(dx, dy * ratio);
        it.w = Math.max(it.type === 'palette' ? 160 : 48, Math.round(drag.ow + d));
        it.h = Math.round(it.w / ratio);
        el.style.width = it.w + 'px';
        el.style.height = it.h + 'px';
      }
      positionCtx();
      return;
    }
    if (drag.mode === 'marquee') {
      const r = els.viewport.getBoundingClientRect();
      const x1 = Math.min(drag.sx, e.clientX) - r.left, y1 = Math.min(drag.sy, e.clientY) - r.top;
      const w = Math.abs(dxS), h = Math.abs(dyS);
      els.marquee.style.transform = `translate(${x1}px, ${y1}px)`;
      els.marquee.style.width = w + 'px';
      els.marquee.style.height = h + 'px';
      els.marquee.hidden = false;
      const a = s2w(x1, y1), b = s2w(x1 + w, y1 + h);
      const wr = { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
      const next = new Set(drag.base);
      for (const it of S.board.items) if (overlaps(it, wr)) next.add(it.id);
      S.selection = next;
      for (const [id, el] of nodes) el.classList.toggle('is-selected', next.has(id));
      if (first) refreshCtx();
    }
  }

  function onPointerUp(e) {
    pointers.delete(e.pointerId);
    if (!drag) return;
    if (drag.mode === 'pinch') { if (pointers.size === 0) drag = null; return; }
    const d = drag;
    drag = null;
    els.viewport.classList.remove('is-panning', 'is-dragging');
    els.marquee.hidden = true;
    if (d.mode === 'move') {
      if (d.moved) { changed(); return; }
      if (d.collapseTo) S.selection = new Set([d.collapseTo]);
      if (d.toggleOff) S.selection.delete(d.toggleOff);
      const sw = d.target && d.target.closest && d.target.closest('[data-hex]');
      if (sw) LB.copyText(sw.dataset.hex).then((ok) => LB.toast(ok ? `Copied ${sw.dataset.hex}` : sw.dataset.hex));
      selectionChanged();
    } else if (d.mode === 'resize') {
      if (d.moved) changed();
    } else if (d.mode === 'marquee') {
      selectionChanged();
    }
  }

  function startPinch() {
    if (drag && drag.moved && (drag.mode === 'move' || drag.mode === 'resize')) changed();
    const [a, b] = [...pointers.values()];
    drag = { mode: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, m0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, cam0: { ...cam } };
    els.marquee.hidden = true;
    els.viewport.classList.remove('is-dragging');
  }
  function updatePinch() {
    const pts = [...pointers.values()];
    if (pts.length < 2) return;
    const [a, b] = pts;
    const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const r = els.viewport.getBoundingClientRect();
    const c0 = drag.cam0;
    const z = LB.clamp((c0.z * d) / drag.d0, MIN_Z, MAX_Z);
    const wx = (drag.m0.x - r.left - c0.x) / c0.z, wy = (drag.m0.y - r.top - c0.y) / c0.z;
    cam = { z, x: m.x - r.left - wx * z, y: m.y - r.top - wy * z };
    applyCamera();
  }

  function onWheel(e) {
    if (!S.board) return;
    if (e.target.closest && e.target.closest('.note-editor')) return;
    e.preventDefault();
    cancelAnimationFrame(camAnim);
    const r = els.viewport.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    let dx = e.deltaX, dy = e.deltaY;
    if (e.deltaMode === 1) { dx *= 16; dy *= 16; } else if (e.deltaMode === 2) { dx *= r.height; dy *= r.height; }
    const zoom = e.ctrlKey || e.metaKey || (LB.settings.get().wheel === 'zoom' && !e.shiftKey);
    if (zoom) {
      const k = e.ctrlKey && Math.abs(dy) < 50 ? 0.012 : 0.0018; // pinch gestures arrive as small ctrl+wheel deltas
      zoomAt(cam.z * Math.exp(-dy * k), sx, sy);
    } else {
      if (e.shiftKey && !dx) { dx = dy; dy = 0; }
      cam = { ...cam, x: cam.x - dx, y: cam.y - dy };
      applyCamera();
    }
  }

  /* ---------- drop & double-click ---------- */
  const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).some((t) => t === 'Files' || t === 'text/uri-list');
  function onDrop(e) {
    els.viewport.classList.remove('is-drop');
    if (!S.board || !e.dataTransfer) return;
    e.preventDefault();
    const p = clientToWorld(e.clientX, e.clientY);
    const files = Array.from(e.dataTransfer.files || []).filter((f) => f.type.startsWith('image/'));
    if (files.length) { LB.actions.addFiles(files, p); return; }
    const uri = (e.dataTransfer.getData('text/uri-list') || '').split('\n').find((l) => l && !l.startsWith('#'));
    if (uri) LB.actions.addFromUrl(uri.trim(), p);
  }
  function onDblClick(e) {
    if (!S.board) return;
    // Pointer capture retargets click events to the viewport, so find what's
    // actually under the pointer.
    const hit = document.elementFromPoint(e.clientX, e.clientY) || e.target;
    if (hit.closest('.no-canvas') || hit.closest('.note-editor')) return;
    if (!els.viewport.contains(hit)) return;
    const itemEl = hit.closest('.item');
    if (!itemEl) { createNote(clientToWorld(e.clientX, e.clientY)); return; }
    const it = getItem(itemEl.dataset.id);
    if (!it) return;
    if (it.type === 'note') startEdit(it.id);
    else if (it.type === 'image') LB.app.openViewer(it.id);
  }

  /* ---------- tools ---------- */
  function setTool(tool) {
    S.tool = tool;
    LB.$$('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === tool)));
    els.viewport.classList.toggle('tool-hand', tool === 'hand');
  }

  /* ---------- open / close ---------- */
  function open(id) {
    return LB.store.withBoardLock(id, async () => {
      const b = await LB.store.getBoard(id);
      if (!b) return null;
      b.items = b.items || [];
      S.board = b;
      S.selection = new Set();
      S.undo = [];
      S.redo = [];
      S.editingId = null;
      clearNodes();
      setStatus('saved');
      updateHistoryButtons();
      if (b.camera && b.items.length) { cam = { ...b.camera }; applyCamera(); }
      render();
      if (!b.camera || !b.items.length) fitAll(false);
      selectionChanged();
      return b;
    });
  }
  async function close() {
    if (!S.board) return;
    finishEdit();
    const id = S.board.id;
    await LB.store.withBoardLock(id, async () => {
      await saveNow();
      S.board = null;
    });
    clearNodes();
    S.selection = new Set();
    refreshCtx();
  }

  function init() {
    els.viewport = LB.$('#viewport');
    els.world = LB.$('#world');
    els.marquee = LB.$('#marquee');
    els.ctx = LB.$('#ctx-bar');
    els.zoomLabel = LB.$('#zoom-label');
    els.empty = LB.$('#empty-hint');
    const vp = els.viewport;
    vp.addEventListener('pointerdown', onPointerDown);
    vp.addEventListener('pointermove', onPointerMove);
    vp.addEventListener('pointerup', onPointerUp);
    vp.addEventListener('pointercancel', onPointerUp);
    vp.addEventListener('wheel', onWheel, { passive: false });
    vp.addEventListener('dblclick', onDblClick);
    vp.addEventListener('dragover', (e) => { if (hasFiles(e)) { e.preventDefault(); vp.classList.add('is-drop'); } });
    vp.addEventListener('dragleave', (e) => { if (e.target === vp) vp.classList.remove('is-drop'); });
    vp.addEventListener('drop', onDrop);
    // Safari trackpad pinch
    let gz = 1;
    vp.addEventListener('gesturestart', (e) => { e.preventDefault(); gz = cam.z; });
    vp.addEventListener('gesturechange', (e) => {
      e.preventDefault();
      const r = vp.getBoundingClientRect();
      zoomAt(gz * e.scale, e.clientX - r.left, e.clientY - r.top);
    });
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && S.board && !isTyping(e)) {
        e.preventDefault();
        if (!spaceDown) { spaceDown = true; vp.classList.add('space-pan'); }
      }
    });
    document.addEventListener('keyup', (e) => {
      if (e.code === 'Space') { spaceDown = false; vp.classList.remove('space-pan'); }
    });
    window.addEventListener('blur', () => { spaceDown = false; vp.classList.remove('space-pan'); });
    new ResizeObserver(() => positionCtx()).observe(vp);
    window.addEventListener('beforeunload', () => { if (S.board) saveSoon.flush(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && S.board) saveSoon.flush(); });
  }

  LB.board = {
    init, open, close, render, changed, checkpoint, undo, redo, saveNow,
    getItem, selectedItems, renderables, addItems, removeItems, bringToFront, sendToBack, duplicate, tidy,
    select, selectionChanged, startEdit, finishEdit, createNote, setTool,
    addGhost, removeGhost, findSpot, bounds, overlaps,
    viewCenter, visibleWorldRect, clientToWorld, fitAll, fitTo, ensureVisible, zoomBy,
    zoomTo: (z) => zoomBy(z / cam.z),
    get cam() { return cam; },
    isTyping,
  };
})();
