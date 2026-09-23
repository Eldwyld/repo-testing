/* Lightbox — app shell: routing, home screen, prompt bar, settings, viewer,
   menus, export/import, keyboard and clipboard. */
(function () {
  'use strict';
  const LB = window.LB;
  const S = LB.state;
  const { $, h } = LB;

  const STARTERS = [
    { label: 'Post-rock album world', text: 'Visual world for a wordless post-rock album called “Weather Systems”: remote concrete structures on a stormy coastline, sodium-vapour orange against cold blue-grey fog, wet asphalt reflections, long-exposure ocean textures, 35mm grain, a feeling of isolation and gradual release.' },
    { label: 'Lighthouse reading nook', text: 'A reading nook inside a converted lighthouse: curved whitewashed walls, warm oak shelving, brass fittings, a deep window seat, rain on the glass, late-afternoon storm light.' },
    { label: 'Tidal research station', text: 'Setting for a slow science-fiction novel about a tidal research station on a mudflat: stilted modular labs, instrument masts, algae-green water, overcast light, worn safety orange, quiet melancholy.' },
    { label: 'Ceramic lamp concept', text: 'Product concept for a ceramic desk lamp: speckled matte glaze, 1970s Japanese industrial design, a soft warm glow, a rounded pill-shaped shade, photographed on travertine.' },
    { label: 'Flooded-cathedral stage', text: 'Stage lighting and set design for an ambient live show in a flooded cathedral: shallow water reflecting sodium and cyan light, haze, projections on stone, silhouettes of musicians.' },
    { label: 'Solarpunk night market', text: 'Poster series for a solarpunk night market: lantern-lit stalls under photovoltaic canopies, hand-painted signage, lush vines, warm magenta and teal, risograph print texture.' },
  ];
  const STICKY = { yellow: '#FFE58F', pink: '#FFC9D6', blue: '#C4E1FF', green: '#CDEFC4', paper: '#FFFFFF' };
  const SOURCE_LABEL = { generated: 'Generated', edit: 'Edited from', combine: 'Combined from', variation: 'Variation of', upload: 'Your upload' };
  const isUntitled = (n) => !n || /^untitled board/i.test(n);
  let pendingIdea = '';

  /* ---------- theme ---------- */
  function applyTheme() {
    const t = LB.settings.get().theme;
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
  }

  /* ---------- routing ---------- */
  async function route() {
    const m = /^#b-([\w-]+)$/.exec(location.hash);
    if (m) await showBoard(m[1]);
    else await showHome();
  }
  async function showHome() {
    closeViewer();
    closePopovers();
    if (S.board) await LB.board.close();
    $('#board').hidden = true;
    $('#home').hidden = false;
    document.title = 'Lightbox';
    await renderHome();
  }
  async function showBoard(id) {
    if (S.board && S.board.id === id) return;
    closePopovers();
    if (S.board) await LB.board.close();
    $('#home').hidden = true;
    $('#board').hidden = false;
    const b = await LB.board.open(id);
    if (!b) {
      LB.toast('That board no longer exists.');
      location.hash = '';
      return;
    }
    syncName();
    onSelection();
    LB.board.render();
    if (pendingIdea) {
      const idea = pendingIdea;
      pendingIdea = '';
      LB.actions.brainstorm(idea);
    }
  }

  /* ---------- home ---------- */
  async function renderHome() {
    const grid = $('#board-grid');
    const boards = await LB.store.listBoards();
    grid.innerHTML = '';
    $('#boards-count').textContent = boards.length ? String(boards.length) : '';
    if (!boards.length) {
      grid.append(h('p', { class: 'boards-empty' }, 'No boards yet. Start one above; it saves in this browser as you go.'));
    }
    for (const b of boards) grid.append(boardCard(b));
    $('#key-callout').hidden = !!(LB.settings.get().apiKey || '').trim();
  }

  function boardCard(b) {
    const items = b.items || [];
    const imgs = items.filter((i) => i.type === 'image').slice(-4).reverse();
    const collage = h('div', { class: `card-collage n${imgs.length}` });
    for (const it of imgs) {
      const img = h('img', { alt: '', loading: 'lazy', decoding: 'async' });
      LB.store.getURL(it.blob).then((u) => { if (u) img.src = u; });
      collage.append(img);
    }
    if (!imgs.length) collage.append(h('span', { class: 'card-blank' }, items.length ? `${items.length} note${items.length > 1 ? 's' : ''}` : 'Empty'));
    const count = items.length;
    return h('article', { class: 'board-card' },
      h('a', { class: 'card-link', href: `#b-${b.id}`, 'aria-label': `Open ${b.name}` }, collage),
      h('div', { class: 'card-meta' },
        h('div', { class: 'card-text' },
          h('h3', {}, h('a', { href: `#b-${b.id}` }, b.name || 'Untitled board')),
          h('p', { class: 'card-sub' }, `${count} item${count === 1 ? '' : 's'} · ${LB.timeAgo(b.updatedAt || b.createdAt || Date.now())}`)),
        h('button', {
          type: 'button', class: 'icon-btn', 'aria-label': `Options for ${b.name}`, title: 'Options', html: LB.icon('more'),
          onclick: (e) => menu(e.currentTarget, [
            { label: 'Open', run: () => { location.hash = `b-${b.id}`; } },
            { label: 'Rename…', run: () => renameBoard(b.id) },
            { label: 'Branch (duplicate)', run: () => branchBoard(b.id, false) },
            { label: 'Save board file (.json)', run: () => exportBoardFile(b.id) },
            '-',
            { label: 'Delete…', danger: true, run: () => deleteBoard(b.id) },
          ]),
        })));
  }

  async function createBoard({ name = 'Untitled board', idea = '' } = {}) {
    const b = { id: LB.uid(''), name, createdAt: Date.now(), updatedAt: Date.now(), items: [], nextFrame: 1 };
    await LB.store.putBoard(b);
    pendingIdea = idea;
    location.hash = `b-${b.id}`;
  }
  async function renameBoard(id) {
    const b = S.board && S.board.id === id ? S.board : await LB.store.getBoard(id);
    if (!b) return;
    const name = await ask({ title: 'Rename board', value: b.name, ok: 'Rename' });
    if (!name) return;
    if (S.board && S.board.id === id) { S.board.name = name; syncName(); LB.board.changed(); }
    else { b.name = name; await LB.store.putBoard(b); renderHome(); }
  }
  async function branchBoard(id, open) {
    if (S.board && S.board.id === id) await LB.board.saveNow();
    const b = await LB.store.getBoard(id);
    if (!b) return;
    const copy = JSON.parse(JSON.stringify(b));
    copy.id = LB.uid('');
    copy.name = `${b.name} (branch)`;
    copy.createdAt = copy.updatedAt = Date.now();
    await LB.store.putBoard(copy);
    LB.toast(`Branched into “${copy.name}”.`);
    if (open) location.hash = `b-${copy.id}`;
    else renderHome();
  }
  async function deleteBoard(id) {
    const b = S.board && S.board.id === id ? S.board : await LB.store.getBoard(id);
    if (!b) return;
    const ok = await ask({ title: `Delete “${b.name}”?`, body: 'Its images and notes are removed from this browser. Branches keep their own copies. This can’t be undone.', ok: 'Delete board', danger: true });
    if (!ok) return;
    if (S.board && S.board.id === id) {
      S.board = null;
      location.hash = '';
    }
    await LB.store.deleteBoard(id);
    await LB.store.gcBlobs().catch(() => {});
    renderHome();
  }

  /* ---------- board chrome ---------- */
  function syncName() {
    const el = $('#board-name');
    if (S.board && document.activeElement !== el) el.value = S.board.name || 'Untitled board';
    if (S.board) document.title = `${S.board.name} · Lightbox`;
  }
  function renameIfUntitled(name) {
    if (!S.board || !name || !isUntitled(S.board.name)) return;
    S.board.name = name;
    syncName();
    LB.board.changed();
  }

  function boardMenu(btn) {
    const imgs = S.board.items.filter((i) => i.type === 'image');
    menu(btn, [
      { label: 'Fit everything', hint: '⇧1', run: () => LB.board.fitAll() },
      { label: 'Style guide for the whole board', run: () => LB.actions.styleGuide(null) },
      '-',
      { label: 'Branch into a new board', run: () => branchBoard(S.board.id, true) },
      { label: 'Rename…', run: () => renameBoard(S.board.id) },
      '-',
      { label: 'Export as PNG', run: () => exportPNG() },
      { label: `Download images (.zip)`, disabled: !imgs.length, run: () => LB.actions.downloadImages(imgs) },
      { label: 'Save board file (.json)', run: () => exportBoardFile(S.board.id) },
      '-',
      { label: 'Delete board…', danger: true, run: () => deleteBoard(S.board.id) },
    ]);
  }

  /* ---------- popovers ---------- */
  let openPop = null;
  function closePopovers() {
    if (openPop) { openPop.remove(); openPop = null; }
  }
  function placePopover(pop, anchor) {
    const r = anchor.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let x = r.left, y = r.bottom + 8;
    if (y + ph > window.innerHeight - 8) y = r.top - ph - 8;
    y = LB.clamp(y, 8, Math.max(8, window.innerHeight - ph - 8));
    x = LB.clamp(x, 8, Math.max(8, window.innerWidth - pw - 8));
    pop.style.left = `${Math.round(x)}px`;
    pop.style.top = `${Math.round(y)}px`;
  }
  function popover(anchor, content, cls = '') {
    if (openPop && openPop._anchor === anchor) { closePopovers(); return null; }
    closePopovers();
    const pop = h('div', { class: `popover ${cls}` }, content);
    pop._anchor = anchor;
    document.body.append(pop);
    placePopover(pop, anchor);
    openPop = pop;
    return pop;
  }
  function menu(anchor, entries) {
    const list = h('div', { class: 'menu', role: 'menu' });
    for (const en of entries) {
      if (en === '-') { list.append(h('div', { class: 'menu-sep', role: 'separator' })); continue; }
      list.append(h('button', {
        type: 'button', role: 'menuitem', class: 'menu-item' + (en.danger ? ' is-danger' : ''), disabled: en.disabled || null,
        onclick: () => { closePopovers(); en.run(); },
      }, h('span', {}, en.label), en.hint ? h('kbd', {}, en.hint) : null));
    }
    const pop = popover(anchor, list, 'is-menu');
    if (!pop) return;
    const items = LB.$$('.menu-item:not([disabled])', pop);
    if (items[0]) items[0].focus({ preventScroll: true });
    pop.addEventListener('keydown', (e) => {
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); (items[i + 1] || items[0]).focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); (items[i - 1] || items[items.length - 1]).focus(); }
      if (e.key === 'Escape') { e.preventDefault(); closePopovers(); anchor.focus(); }
      if (e.key === 'Tab') closePopovers();
    });
  }

  function infoBlock(it) {
    const src = SOURCE_LABEL[it.source] || 'Image';
    const parents = (it.parentFrames || []).filter(Boolean);
    const rows = [
      ['Frame', LB.pad2(it.frame || 0)],
      ['Origin', parents.length && it.source !== 'generated' ? `${src} ${parents.map(LB.pad2).join(' + ')}` : parents.length ? `Generated from ${parents.map(LB.pad2).join(' + ')}` : src.replace(/ from| of/, '')],
    ];
    if (it.model) rows.push(['Model', it.model]);
    if (it.natW) rows.push(['Pixels', `${it.natW} × ${it.natH}`]);
    if (it.filename) rows.push(['File', it.filename]);
    if (it.createdAt) rows.push(['Added', new Date(it.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })]);
    const dl = h('dl', { class: 'info-list' });
    for (const [k, v] of rows) dl.append(h('dt', {}, k), h('dd', {}, v));
    const wrap = h('div', { class: 'info' }, dl);
    if (it.prompt) wrap.append(h('p', { class: 'info-label' }, 'Prompt'), h('p', { class: 'info-prompt' }, it.prompt));
    return wrap;
  }
  function showInfo(anchor, it) {
    const body = infoBlock(it);
    if (it.prompt) {
      body.append(h('div', { class: 'info-actions' },
        h('button', { type: 'button', class: 'btn small ghost', onclick: () => LB.copyText(it.prompt).then((ok) => LB.toast(ok ? 'Prompt copied' : 'Couldn’t reach the clipboard')) }, 'Copy prompt'),
        h('button', { type: 'button', class: 'btn small', onclick: () => { closePopovers(); reusePrompt(it.prompt); } }, 'Reuse prompt')));
    }
    popover(anchor, body, 'is-info');
  }

  /* ---------- prompt bar ---------- */
  const promptHistory = [];
  let histIdx = -1;
  function input() { return $('#prompt-input'); }
  function autosize() {
    const el = input();
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }
  function focusPrompt() {
    const el = input();
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }
  function reusePrompt(text) {
    if (LB.settings.get().mode !== 'images') setMode('images');
    LB.board.select([]);
    input().value = text;
    autosize();
    updateGo();
    focusPrompt();
  }
  function setMode(mode) {
    LB.settings.set({ mode });
    LB.$$('#prompt-mode [data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    onSelection();
  }
  function selectionParts() {
    const sel = S.board ? LB.board.selectedItems() : [];
    return { sel, imgs: sel.filter((i) => i.type === 'image'), notes: sel.filter((i) => i.type === 'note') };
  }
  function updateGo() {
    const { imgs } = selectionParts();
    const mode = LB.settings.get().mode;
    const textOptional = mode === 'images' && imgs.length >= 2;
    $('#prompt-go').disabled = !textOptional && !input().value.trim();
  }
  function onSelection() {
    if (!S.board) return;
    const { imgs, notes } = selectionParts();
    const mode = LB.settings.get().mode;
    const ideas = mode === 'ideas';
    const frames = imgs.length > 4 ? `${imgs.length} images` : imgs.map((i) => LB.pad2(i.frame || 0)).join(' + ');
    let label = 'Generate', ph = 'Describe an image to generate…', ref = '';
    if (ideas) {
      label = 'Plan';
      ph = imgs.length ? 'What should these references grow into?' : 'Describe an idea. Lightbox plans images and notes around it…';
      if (imgs.length) ref = `Inspired by ${frames}`;
    } else if (imgs.length === 1) {
      label = 'Edit';
      ph = 'Describe a change: “make it dusk”, “swap the chair for a hammock”…';
      ref = `Editing ${frames}`;
    } else if (imgs.length > 1) {
      label = 'Combine';
      ph = `How should these ${imgs.length} combine? Optional.`;
      ref = `Combining ${frames}`;
    } else if (notes.length) {
      ph = 'Describe an image. The selected notes are used as context…';
      ref = `${notes.length} note${notes.length > 1 ? 's' : ''} as context`;
    }
    const refs = $('#prompt-refs');
    refs.innerHTML = '';
    refs.hidden = !ref;
    if (ref) {
      for (const it of imgs.slice(0, 5)) {
        const img = h('img', { alt: '' });
        const u = LB.store.cachedURL(it.blob);
        if (u) img.src = u;
        else LB.store.getURL(it.blob).then((x) => { if (x) img.src = x; });
        refs.append(img);
      }
      refs.append(
        h('span', { class: 'refs-label' }, ref),
        h('button', { type: 'button', class: 'refs-clear', 'aria-label': 'Clear selection', title: 'Clear selection', html: LB.icon('x'), onclick: () => LB.board.select([]) }));
    }
    $('#prompt-go-label').textContent = label;
    input().placeholder = ph;
    $('#pick-ratio').hidden = ideas;
    $('#pick-count').hidden = ideas;
    $('#prompt-hint').hidden = !ideas;
    updateGo();
  }
  function submitPrompt() {
    const text = input().value.trim();
    const s = LB.settings.get();
    const ok = LB.actions.submitPrompt({ text, mode: s.mode, count: s.count, ratio: s.ratio });
    if (!ok) return;
    if (text && promptHistory[promptHistory.length - 1] !== text) promptHistory.push(text);
    histIdx = -1;
    input().value = '';
    autosize();
    updateGo();
  }
  function bindPrompt() {
    const el = input();
    const s = LB.settings.get();
    $('#prompt-ratio').value = s.ratio;
    $('#prompt-count').value = String(s.count);
    LB.$$('#prompt-mode [data-mode]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.mode === s.mode));
      b.addEventListener('click', () => setMode(b.dataset.mode));
    });
    $('#prompt-ratio').addEventListener('change', (e) => LB.settings.set({ ratio: e.target.value }));
    $('#prompt-count').addEventListener('change', (e) => LB.settings.set({ count: Number(e.target.value) }));
    $('#prompt').addEventListener('submit', (e) => { e.preventDefault(); submitPrompt(); });
    el.addEventListener('input', () => { autosize(); updateGo(); });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!$('#prompt-go').disabled) submitPrompt(); }
      else if (e.key === 'Escape') { e.preventDefault(); el.blur(); }
      else if (e.key === 'ArrowUp' && promptHistory.length && (!el.value || histIdx >= 0)) {
        e.preventDefault();
        histIdx = histIdx < 0 ? promptHistory.length - 1 : Math.max(0, histIdx - 1);
        el.value = promptHistory[histIdx];
        autosize(); updateGo();
      } else if (e.key === 'ArrowDown' && histIdx >= 0) {
        e.preventDefault();
        histIdx++;
        el.value = histIdx < promptHistory.length ? promptHistory[histIdx] : '';
        if (histIdx >= promptHistory.length) histIdx = -1;
        autosize(); updateGo();
      }
    });
  }

  /* ---------- viewer ---------- */
  let viewer = { list: [], idx: 0 };
  function openViewer(id) {
    if (!S.board) return;
    const list = S.board.items.filter((i) => i.type === 'image').sort((a, b) => (a.frame || 0) - (b.frame || 0));
    const idx = list.findIndex((i) => i.id === id);
    if (idx < 0) return;
    closePopovers();
    viewer = { list, idx };
    $('#viewer').hidden = false;
    showViewerImage();
    $('#viewer-close').focus();
  }
  function showViewerImage() {
    const it = viewer.list[viewer.idx];
    const img = $('#viewer-img');
    const u = LB.store.cachedURL(it.blob);
    if (u) img.src = u;
    else { img.removeAttribute('src'); LB.store.getURL(it.blob).then((x) => { if (x && viewer.list[viewer.idx] === it) img.src = x; }); }
    img.alt = it.prompt || 'Board image';
    $('#viewer-frame').textContent = `${LB.pad2(it.frame || 0)}  ·  ${viewer.idx + 1} of ${viewer.list.length}`;
    $('#viewer-info').replaceChildren(infoBlock(it));
    $('#viewer-reuse').hidden = !it.prompt;
    $('#viewer-prev').disabled = viewer.idx === 0;
    $('#viewer-next').disabled = viewer.idx === viewer.list.length - 1;
  }
  function closeViewer() {
    const v = $('#viewer');
    if (!v || v.hidden) return;
    v.hidden = true;
    $('#viewer-img').removeAttribute('src');
  }
  function stepViewer(d) {
    const n = viewer.idx + d;
    if (n < 0 || n >= viewer.list.length) return;
    viewer.idx = n;
    showViewerImage();
  }
  function bindViewer() {
    $('#viewer-close').addEventListener('click', closeViewer);
    $('#viewer-prev').addEventListener('click', () => stepViewer(-1));
    $('#viewer-next').addEventListener('click', () => stepViewer(1));
    $('#viewer').addEventListener('click', (e) => { if (e.target.classList.contains('viewer-stage')) closeViewer(); });
    $('#viewer-use').addEventListener('click', () => {
      const it = viewer.list[viewer.idx];
      closeViewer();
      if (LB.settings.get().mode !== 'images') setMode('images');
      LB.board.select([it.id]);
      focusPrompt();
    });
    $('#viewer-reuse').addEventListener('click', () => { const it = viewer.list[viewer.idx]; closeViewer(); reusePrompt(it.prompt); });
    $('#viewer-download').addEventListener('click', () => LB.actions.downloadImage(viewer.list[viewer.idx]));
  }

  /* ---------- settings ---------- */
  let loadedModels = null;
  function fillDatalists() {
    const opts = (presets, loaded) => {
      const seen = new Set();
      return [...presets, ...(loaded || [])].filter((m) => !seen.has(m.id) && seen.add(m.id))
        .map((m) => h('option', { value: m.id }, m.label));
    };
    $('#dl-image-models').replaceChildren(...opts(LB.gemini.IMAGE_MODELS, loadedModels && loadedModels.image));
    $('#dl-text-models').replaceChildren(...opts(LB.gemini.TEXT_MODELS, loadedModels && loadedModels.text));
  }
  async function openSettings({ reason } = {}) {
    const d = $('#settings');
    const s = LB.settings.get();
    $('#settings-callout').hidden = reason !== 'key';
    $('#set-key').value = s.apiKey || '';
    $('#set-image-model').value = s.imageModel;
    $('#set-text-model').value = s.textModel;
    $('#set-size').value = s.imageSize;
    $('#set-wheel').value = s.wheel;
    $('#set-theme').value = s.theme;
    fillDatalists();
    if (!d.open) d.showModal();
    if (reason === 'key' || !s.apiKey) $('#set-key').focus();
    const used = await LB.store.estimate();
    $('#set-storage').textContent = used == null ? '' : `Boards and images use about ${(used / 1048576).toFixed(1)} MB of this browser’s storage. Save a board file to back one up.`;
  }
  function bindSettings() {
    const set = (k, v) => LB.settings.set({ [k]: v });
    $('#set-key').addEventListener('input', (e) => set('apiKey', e.target.value.trim()));
    $('#set-key-show').addEventListener('click', (e) => {
      const k = $('#set-key');
      const show = k.type === 'password';
      k.type = show ? 'text' : 'password';
      e.currentTarget.textContent = show ? 'Hide' : 'Show';
    });
    $('#set-image-model').addEventListener('change', (e) => set('imageModel', e.target.value.trim() || LB.settings.DEFAULTS.imageModel));
    $('#set-text-model').addEventListener('change', (e) => set('textModel', e.target.value.trim() || LB.settings.DEFAULTS.textModel));
    $('#set-size').addEventListener('change', (e) => set('imageSize', e.target.value));
    $('#set-wheel').addEventListener('change', (e) => set('wheel', e.target.value));
    $('#set-theme').addEventListener('change', (e) => { set('theme', e.target.value); applyTheme(); });
    $('#set-check').addEventListener('click', async () => {
      const status = $('#set-check-status');
      status.textContent = 'Checking…';
      status.dataset.state = '';
      try {
        loadedModels = await LB.gemini.listModels();
        fillDatalists();
        const s = LB.settings.get();
        const pick = (current, loaded, presets) => {
          const ids = loaded.map((m) => m.id);
          if (!ids.length || ids.includes(current)) return current;
          return presets.map((m) => m.id).find((id) => ids.includes(id)) || ids[0];
        };
        const im = pick(s.imageModel, loadedModels.image, LB.gemini.IMAGE_MODELS);
        const tm = pick(s.textModel, loadedModels.text, LB.gemini.TEXT_MODELS);
        const switched = [];
        if (im !== s.imageModel) { LB.settings.set({ imageModel: im }); $('#set-image-model').value = im; switched.push(`image model → ${im}`); }
        if (tm !== s.textModel && !/latest$/.test(s.textModel)) { LB.settings.set({ textModel: tm }); $('#set-text-model').value = tm; switched.push(`text model → ${tm}`); }
        status.dataset.state = 'ok';
        status.textContent = `Key works: ${loadedModels.image.length} image and ${loadedModels.text.length} text models available.${switched.length ? ' Switched ' + switched.join(', ') + '.' : ''}`;
      } catch (err) {
        status.dataset.state = 'error';
        status.textContent = LB.gemini.friendly(err);
      }
    });
    $('#settings').addEventListener('close', () => {
      if (!$('#home').hidden) renderHome();
    });
  }

  /* ---------- confirm / prompt dialog ---------- */
  function ask({ title, body = '', value = null, ok = 'OK', danger = false }) {
    const d = $('#ask');
    $('#ask-title').textContent = title;
    $('#ask-body').textContent = body;
    $('#ask-body').hidden = !body;
    const inp = $('#ask-input');
    inp.hidden = value == null;
    if (value != null) inp.value = value;
    const okBtn = $('#ask-ok');
    okBtn.textContent = ok;
    okBtn.classList.toggle('danger', danger);
    d.returnValue = '';
    d.showModal();
    if (value != null) { inp.focus(); inp.select(); } else okBtn.focus();
    return new Promise((resolve) => {
      d.addEventListener('close', () => {
        if (d.returnValue !== 'ok') return resolve(null);
        resolve(value != null ? inp.value.trim() || null : true);
      }, { once: true });
    });
  }

  /* ---------- export / import ---------- */
  function wrapText(ctx, text, maxW) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (ctx.measureText(next).width > maxW && line) { lines.push(line); line = w; }
      else line = next;
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function drawNote(ctx, it, T) {
    const variant = it.variant || 'text';
    const card = variant === 'sticky';
    const padX = card ? 18 : 8, padY = card ? 16 : 6;
    if (card) {
      ctx.fillStyle = STICKY[it.color] || STICKY.yellow;
      roundRect(ctx, it.x, it.y, it.w, it.h, 6);
      ctx.fill();
    }
    const ink = card ? '#1d1c19' : T.ink;
    const ink2 = card ? 'rgba(29,28,25,0.62)' : T.ink2;
    const base = variant === 'heading' ? 18 : card ? 15 : 16;
    const maxW = it.w - padX * 2;
    let y = it.y + padY;
    ctx.textBaseline = 'top';
    for (const b of LB.markdownBlocks(it.text)) {
      if (b.kind === 'gap') { y += base * 0.6; continue; }
      let size = base, lh = base * 1.5, color = ink, indent = 0, text = b.text;
      let font = `400 ${size}px Figtree, system-ui, sans-serif`;
      if (b.kind === 'h1') {
        size = variant === 'heading' ? 44 : card ? 22 : 26;
        lh = size * 1.1;
        font = `700 ${size}px "Bricolage Grotesque", system-ui, sans-serif`;
      } else if (b.kind === 'h2') {
        size = 11; lh = 20; color = ink2; text = text.toUpperCase(); y += 6;
        font = `500 ${size}px "IBM Plex Mono", ui-monospace, monospace`;
      } else {
        if (variant === 'heading') color = ink2;
        if (b.kind === 'li') indent = 16;
      }
      ctx.font = font;
      ctx.fillStyle = color;
      wrapText(ctx, text, maxW - indent).forEach((ln, i) => {
        if (indent && i === 0) ctx.fillText('–', it.x + padX, y + (lh - size) / 2);
        ctx.fillText(ln, it.x + padX + indent, y + (lh - size) / 2);
        y += lh;
      });
    }
  }
  async function exportPNG() {
    if (!S.board) return;
    const items = S.board.items;
    if (!items.length) { LB.toast('Nothing on this board to export yet.'); return; }
    const done = LB.toast('Rendering PNG…', { timeout: 0 });
    try {
      await document.fonts.ready;
      const b = LB.board.bounds(items);
      const pad = 64;
      const W = b.w + pad * 2, H = b.h + pad * 2;
      const scale = Math.max(0.25, Math.min(2, 7000 / Math.max(W, H)));
      const c = document.createElement('canvas');
      c.width = Math.round(W * scale);
      c.height = Math.round(H * scale);
      const ctx = c.getContext('2d');
      const css = getComputedStyle(document.documentElement);
      const T = { canvas: css.getPropertyValue('--canvas').trim() || '#edeef0', ink: css.getPropertyValue('--ink').trim() || '#15171a', ink2: css.getPropertyValue('--ink-2').trim() || '#5a6068' };
      ctx.scale(scale, scale);
      ctx.fillStyle = T.canvas;
      ctx.fillRect(0, 0, W, H);
      ctx.translate(pad - b.x, pad - b.y);
      for (const it of items) {
        if (it.type === 'image') {
          const blob = await LB.store.getBlob(it.blob);
          if (!blob) continue;
          const bmp = await LB.loadBitmap(blob);
          ctx.drawImage(bmp, it.x, it.y, it.w, it.h);
          if (bmp.close) bmp.close();
        } else if (it.type === 'palette') {
          const n = it.colors.length || 1, sw = it.w / n;
          it.colors.forEach((col, i) => {
            ctx.fillStyle = col;
            ctx.fillRect(it.x + i * sw, it.y, Math.ceil(sw), it.h);
            ctx.fillStyle = LB.inkFor(col);
            ctx.font = '500 11px "IBM Plex Mono", ui-monospace, monospace';
            ctx.textBaseline = 'bottom';
            ctx.fillText(col, it.x + i * sw + 8, it.y + it.h - 8);
          });
        } else if (it.type === 'note') {
          drawNote(ctx, it, T);
        }
      }
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      LB.downloadBlob(blob, `${LB.slug(S.board.name)}.png`);
    } catch (e) {
      LB.toast(`Couldn’t export: ${e.message}`, { type: 'error' });
    } finally {
      done();
    }
  }
  async function exportBoardFile(id) {
    if (S.board && S.board.id === id) await LB.board.saveNow();
    const b = await LB.store.getBoard(id);
    if (!b) return;
    const blobs = {};
    for (const it of b.items || []) {
      if (!it.blob || blobs[it.blob]) continue;
      const blob = await LB.store.getBlob(it.blob);
      if (blob) blobs[it.blob] = await LB.blobToDataURL(blob);
    }
    const file = { format: 'lightbox-board', version: 1, exportedAt: new Date().toISOString(), board: b, blobs };
    LB.downloadBlob(new Blob([JSON.stringify(file)], { type: 'application/json' }), `${LB.slug(b.name)}.lightbox.json`);
  }
  async function importBoardFile(file) {
    try {
      const data = JSON.parse(await file.text());
      if (!data || data.format !== 'lightbox-board' || !data.board) throw new Error('This isn’t a Lightbox board file.');
      for (const [id, url] of Object.entries(data.blobs || {})) await LB.store.putBlob(LB.dataURLToBlob(url), id);
      const b = data.board;
      b.id = LB.uid('');
      b.items = Array.isArray(b.items) ? b.items : [];
      b.updatedAt = Date.now();
      await LB.store.putBoard(b);
      LB.toast(`Imported “${b.name}”.`);
      location.hash = `b-${b.id}`;
    } catch (e) {
      LB.toast(`Couldn’t import: ${e.message}`, { type: 'error' });
    }
  }

  /* ---------- bindings ---------- */
  function bindHome() {
    const chips = $('#starter-chips');
    for (const s of STARTERS) {
      chips.append(h('button', {
        type: 'button', class: 'chip', title: s.text,
        onclick: () => { const t = $('#starter-input'); t.value = s.text; t.focus(); },
      }, s.label));
    }
    $('#starter').addEventListener('submit', async (e) => {
      e.preventDefault();
      const idea = $('#starter-input').value.trim();
      if (!idea) { $('#starter-input').focus(); return; }
      if (!(LB.settings.get().apiKey || '').trim()) { openSettings({ reason: 'key' }); return; }
      $('#starter-input').value = '';
      await createBoard({ idea });
    });
    $('#starter-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); $('#starter').requestSubmit(); }
    });
    $('#new-blank').addEventListener('click', () => createBoard());
    $('#home-settings').addEventListener('click', () => openSettings());
    $('#key-callout-btn').addEventListener('click', () => openSettings({ reason: 'key' }));
    $('#home-import').addEventListener('click', () => $('#import-input').click());
    $('#import-input').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (f) importBoardFile(f);
    });
  }

  function bindBoardChrome() {
    const name = $('#board-name');
    name.addEventListener('input', () => { if (S.board) { S.board.name = name.value; document.title = `${name.value} · Lightbox`; } });
    name.addEventListener('change', () => { if (S.board) { S.board.name = name.value.trim() || 'Untitled board'; syncName(); LB.board.changed(); } });
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); name.blur(); } });
    $('#btn-undo').addEventListener('click', () => LB.board.undo());
    $('#btn-redo').addEventListener('click', () => LB.board.redo());
    $('#btn-board-menu').addEventListener('click', (e) => boardMenu(e.currentTarget));
    $('#btn-settings').addEventListener('click', () => openSettings());
    LB.$$('[data-tool]').forEach((b) => b.addEventListener('click', () => LB.board.setTool(b.dataset.tool)));
    const noteAtCenter = (variant) => {
      const c = LB.board.viewCenter();
      LB.board.createNote({ x: c.x - (variant === 'sticky' ? 120 : 160), y: c.y - 40 }, variant);
    };
    $('#tool-text').addEventListener('click', () => noteAtCenter('text'));
    $('#tool-sticky').addEventListener('click', () => noteAtCenter('sticky'));
    $('#tool-upload').addEventListener('click', () => $('#file-input').click());
    $('#file-input').addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      e.target.value = '';
      if (files.length) LB.actions.addFiles(files, null);
    });
    $('#zoom-in').addEventListener('click', () => LB.board.zoomBy(1.25));
    $('#zoom-out').addEventListener('click', () => LB.board.zoomBy(0.8));
    $('#zoom-label').addEventListener('click', () => LB.board.zoomTo(1));
    $('#zoom-fit').addEventListener('click', () => LB.board.fitAll());
    document.addEventListener('pointerdown', (e) => {
      if (openPop && !openPop.contains(e.target) && !(openPop._anchor && openPop._anchor.contains(e.target))) closePopovers();
    }, true);
    window.addEventListener('resize', closePopovers);
  }

  let lastNudge = 0;
  function nudge(dx, dy) {
    const sel = LB.board.selectedItems();
    if (!sel.length) return;
    if (Date.now() - lastNudge > 700) LB.board.checkpoint();
    lastNudge = Date.now();
    for (const it of sel) { it.x += dx; it.y += dy; }
    LB.board.changed();
  }

  function bindKeys() {
    document.addEventListener('keydown', (e) => {
      if (!$('#viewer').hidden) {
        if (e.key === 'Escape') { e.preventDefault(); closeViewer(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); stepViewer(-1); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); stepViewer(1); }
        return;
      }
      if (e.key === 'Escape' && openPop) { closePopovers(); return; }
      if (!S.board || $('#board').hidden || document.querySelector('dialog[open]')) return;
      if (LB.board.isTyping(e)) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod) {
        if (k === 'z') { e.preventDefault(); if (e.shiftKey) LB.board.redo(); else LB.board.undo(); }
        else if (k === 'y') { e.preventDefault(); LB.board.redo(); }
        else if (k === 'd') { e.preventDefault(); LB.board.duplicate([...S.selection]); }
        else if (k === 'a') { e.preventDefault(); LB.board.select(S.board.items.map((i) => i.id)); }
        else if (k === '0') { e.preventDefault(); LB.board.zoomTo(1); }
        else if (k === '=' || k === '+') { e.preventDefault(); LB.board.zoomBy(1.25); }
        else if (k === '-') { e.preventDefault(); LB.board.zoomBy(0.8); }
        return;
      }
      if (e.altKey) return;
      if (e.shiftKey && e.code === 'Digit1') { e.preventDefault(); LB.board.fitAll(); return; }
      if (e.shiftKey && e.code === 'Digit2') {
        e.preventDefault();
        const sel = LB.board.selectedItems();
        if (sel.length) LB.board.fitTo(LB.board.bounds(sel), { maxZ: 2 });
        return;
      }
      const step = e.shiftKey ? 10 : 1;
      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          if (S.selection.size) { e.preventDefault(); LB.board.removeItems([...S.selection]); }
          break;
        case 'Escape':
          if (S.selection.size) LB.board.select([]);
          break;
        case 'Enter': {
          const sel = LB.board.selectedItems();
          if (sel.length === 1 && sel[0].type === 'note') { e.preventDefault(); LB.board.startEdit(sel[0].id); }
          else if (sel.length === 1 && sel[0].type === 'image') { e.preventDefault(); openViewer(sel[0].id); }
          else if (sel.some((i) => i.type === 'image')) { e.preventDefault(); focusPrompt(); }
          break;
        }
        case '/': e.preventDefault(); focusPrompt(); break;
        case 'ArrowLeft': if (S.selection.size) { e.preventDefault(); nudge(-step, 0); } break;
        case 'ArrowRight': if (S.selection.size) { e.preventDefault(); nudge(step, 0); } break;
        case 'ArrowUp': if (S.selection.size) { e.preventDefault(); nudge(0, -step); } break;
        case 'ArrowDown': if (S.selection.size) { e.preventDefault(); nudge(0, step); } break;
        case '+': case '=': LB.board.zoomBy(1.25); break;
        case '-': case '_': LB.board.zoomBy(0.8); break;
        default:
          if (e.shiftKey) break;
          if (k === 'v') LB.board.setTool('select');
          else if (k === 'h') LB.board.setTool('hand');
          else if (k === 't') { e.preventDefault(); $('#tool-text').click(); }
          else if (k === 's') { e.preventDefault(); $('#tool-sticky').click(); }
          else if (k === 'u') $('#file-input').click();
      }
    });
  }

  /* Copy/paste: images and text from other apps; board items within Lightbox. */
  let clip = null;
  const CLIP_TOKEN = 'lightbox-items:';
  function bindClipboard() {
    document.addEventListener('copy', (e) => {
      if (!S.board || $('#board').hidden || LB.board.isTyping(e) || !S.selection.size) return;
      const items = LB.board.selectedItems();
      clip = { id: LB.uid(), items: JSON.parse(JSON.stringify(items)) };
      e.clipboardData.setData('text/plain', CLIP_TOKEN + clip.id);
      e.preventDefault();
      LB.toast(`Copied ${items.length} item${items.length > 1 ? 's' : ''}`);
    });
    document.addEventListener('paste', async (e) => {
      if (!S.board || $('#board').hidden || !e.clipboardData) return;
      const files = Array.from(e.clipboardData.files || []).filter((f) => f.type.startsWith('image/'));
      const inPrompt = e.target === input();
      if (LB.board.isTyping(e) && !(inPrompt && files.length)) return;
      if (files.length) {
        e.preventDefault();
        const added = await LB.actions.addFiles(files, null);
        if (inPrompt && added.length) { LB.board.select(added.map((i) => i.id)); focusPrompt(); }
        return;
      }
      const text = e.clipboardData.getData('text/plain') || '';
      if (clip && text === CLIP_TOKEN + clip.id) {
        e.preventDefault();
        const copies = clip.items.map((it) => {
          const c = JSON.parse(JSON.stringify(it));
          c.id = LB.uid(it.type[0] + '_');
          c.x += 40; c.y += 40;
          delete c.frame;
          return c;
        });
        clip.items = copies;
        LB.board.addItems(copies);
        return;
      }
      const t = text.trim();
      if (!t) return;
      e.preventDefault();
      if (/^https?:\/\/\S+\.(png|jpe?g|webp|gif)(\?\S*)?$/i.test(t)) { LB.actions.addFromUrl(t, null); return; }
      const c = LB.board.viewCenter();
      LB.board.createNote({ x: c.x - 160, y: c.y - 40 }, 'text', t);
    });
  }

  async function start() {
    LB.hydrateIcons();
    applyTheme();
    LB.board.init();
    bindHome();
    bindBoardChrome();
    bindPrompt();
    bindViewer();
    bindSettings();
    bindKeys();
    bindClipboard();
    window.addEventListener('hashchange', () => route());
    window.addEventListener('unhandledrejection', (e) => {
      console.error(e.reason);
      LB.toast(`Something went wrong: ${(e.reason && e.reason.message) || e.reason}`, { type: 'error' });
    });
    LB.store.requestPersistence();
    await route();
    setTimeout(() => LB.store.gcBlobs().catch(() => {}), 5000);
  }

  LB.app = {
    openSettings, openViewer, showInfo, menu, closePopovers, focusPrompt, onSelection, renameIfUntitled,
  };
  start();
})();
