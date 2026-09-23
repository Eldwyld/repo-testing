/* Lightbox — what the buttons do: generate, edit, combine, variations, board
   planning, style guides, palettes, uploads and the context toolbar. */
(function () {
  'use strict';
  const LB = window.LB;
  const S = LB.state;

  /* ---------- a small queue so we don't fire 12 requests at once ---------- */
  const MAX_PARALLEL = 3;
  const queue = [];
  let active = 0;
  function enqueue(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      pump();
    });
  }
  function pump() {
    while (active < MAX_PARALLEL && queue.length) {
      const job = queue.shift();
      active++;
      Promise.resolve()
        .then(job.fn)
        .then(job.resolve, job.reject)
        .finally(() => { active--; pump(); });
    }
  }

  function requireKey() {
    if ((LB.settings.get().apiKey || '').trim()) return true;
    LB.app.openSettings({ reason: 'key' });
    return false;
  }

  /* Add finished items to a board, whether or not it's the one on screen. */
  function addToBoard(boardId, items, { name } = {}) {
    return LB.store.withBoardLock(boardId, async () => {
      if (S.board && S.board.id === boardId) {
        LB.board.addItems(items, { select: false });
        if (name) LB.app.renameIfUntitled(name);
        return true;
      }
      const b = await LB.store.getBoard(boardId);
      if (!b) return false;
      for (const it of items) {
        if (it.type === 'image' && !it.frame) { b.nextFrame = b.nextFrame || 1; it.frame = b.nextFrame++; }
      }
      b.items.push(...items);
      if (name && isUntitled(b.name)) b.name = name;
      b.updatedAt = Date.now();
      await LB.store.putBoard(b);
      return true;
    });
  }
  const isUntitled = (n) => !n || /^untitled board/i.test(n);

  /* ---------- placeholders ---------- */
  const ghostSize = (ratio) => LB.displaySize(LB.ratioValue(ratio || '1:1'));
  const rectsOf = (list) => list.map(({ x, y, w, h }) => ({ x, y, w, h }));

  /* Place boxes in a row next to an anchor (or centred in view), avoiding
     everything already on the board. */
  function placeRow(sizes, anchor) {
    const occ = rectsOf(LB.board.renderables());
    const out = [];
    let start;
    if (anchor) start = { x: anchor.x + anchor.w + 32, y: anchor.y };
    else {
      const c = LB.board.viewCenter();
      const total = sizes.reduce((t, s) => t + s.w + 24, -24);
      start = { x: c.x - total / 2, y: c.y - sizes[0].h / 2 };
    }
    for (const s of sizes) {
      const p = LB.board.findSpot(s.w, s.h, start, occ);
      const r = { x: p.x, y: p.y, w: s.w, h: s.h };
      out.push(r);
      occ.push(r);
      start = { x: r.x + r.w + 24, y: r.y };
    }
    LB.board.ensureVisible(LB.board.bounds(out));
    return out;
  }

  function makeGhost(fields) {
    return { id: LB.uid('g_'), type: 'ghost', status: 'queued', kind: 'image', ...fields };
  }

  /* One image generation: placeholder → Gemini → image on the board. */
  function imageJob({ boardId, rect, label, prompt, refBlobIds = [], aspectRatio, meta = {} }) {
    const g = makeGhost({ boardId, x: rect.x, y: rect.y, w: rect.w, h: rect.h, label });
    let ctrl = null;
    g.cancel = () => { g.cancelled = true; if (ctrl) ctrl.abort(); LB.board.removeGhost(g); };
    const attempt = () => {
      g.status = 'queued';
      g.error = null;
      g.cancelled = false;
      ctrl = new AbortController();
      LB.board.render();
      enqueue(async () => {
        if (g.cancelled) return;
        g.status = 'loading';
        LB.board.render();
        const refs = [];
        for (const id of refBlobIds) { const b = await LB.store.getBlob(id); if (b) refs.push(b); }
        const res = await LB.gemini.generateImage({ prompt, images: refs, aspectRatio, signal: ctrl.signal });
        if (g.cancelled) return;
        const { w: natW, h: natH } = await LB.imageSize(res.blob);
        const blobId = await LB.store.putBlob(res.blob);
        LB.store.primeURL(blobId, res.blob);
        const size = LB.displaySize(natW / natH);
        const item = {
          id: LB.uid('i_'), type: 'image',
          x: Math.round(g.x + (g.w - size.w) / 2), y: Math.round(g.y + (g.h - size.h) / 2),
          w: size.w, h: size.h, natW, natH, blob: blobId, mime: res.blob.type,
          prompt: meta.prompt != null ? meta.prompt : prompt,
          apiPrompt: prompt, refs: refBlobIds, aspectRatio: aspectRatio || null,
          source: meta.source || 'generated', parentFrames: meta.parentFrames || [],
          model: res.model, createdAt: Date.now(),
        };
        await addToBoard(boardId, [item]);
        LB.board.removeGhost(g);
      }).catch((err) => {
        if (g.cancelled || (err && err.name === 'AbortError')) { LB.board.removeGhost(g); return; }
        console.error(err);
        g.status = 'error';
        g.error = LB.gemini.friendly(err);
        g.retry = attempt;
        LB.board.render();
      });
    };
    LB.board.addGhost(g);
    attempt();
    return g;
  }

  /* One text generation that becomes note(s). `run` returns item fields. */
  function textJob({ boardId, rect, label, kind = 'text', run, after }) {
    const g = makeGhost({ boardId, kind, x: rect.x, y: rect.y, w: rect.w, h: rect.h, label });
    let ctrl = null;
    g.cancel = () => { g.cancelled = true; if (ctrl) ctrl.abort(); LB.board.removeGhost(g); };
    const attempt = () => {
      g.status = 'loading';
      g.error = null;
      g.cancelled = false;
      ctrl = new AbortController();
      LB.board.render();
      Promise.resolve()
        .then(() => run(ctrl.signal, g))
        .then(async (items) => {
          if (g.cancelled) return;
          if (items && items.length) await addToBoard(boardId, items);
          LB.board.removeGhost(g);
          if (after && S.board && S.board.id === boardId) after(items);
        })
        .catch((err) => {
          if (g.cancelled || (err && err.name === 'AbortError')) { LB.board.removeGhost(g); return; }
          console.error(err);
          g.status = 'error';
          g.error = LB.gemini.friendly(err);
          g.retry = attempt;
          LB.board.render();
        });
    };
    LB.board.addGhost(g);
    attempt();
    return g;
  }

  /* ---------- prompts ---------- */
  const VARIATION_ONE =
    'Create a new image that belongs in the same visual world as this reference: same medium, style, palette, lighting and mood, ' +
    'but a different composition, viewpoint or moment. It should feel like the next frame on the same contact sheet, not a copy.';
  const VARIATION_MANY = (n) =>
    `Create a new image that belongs in the same visual world as these ${n} references: shared medium, style, palette, lighting and mood, ` +
    'with a fresh subject or composition that could sit beside them on the same moodboard. Not a collage.';
  const COMBINE = (text, n) =>
    `Use the ${n} reference images as ingredients and create one new, cohesive image. ` +
    (text
      ? `Direction: ${text}`
      : 'Blend their subjects, styles, palettes and moods into a single coherent composition.') +
    ' Do not lay them out side by side as a collage unless asked.';

  const QUICK_EDITS = [
    { label: 'Remove background', prompt: 'Remove the background completely and place the main subject on a seamless pure white studio background. Keep the subject itself exactly as it is.' },
    { label: 'Make it a photograph', prompt: 'Re-render this as a photorealistic photograph with natural lens characteristics, keeping the same composition, subject and palette.' },
    { label: 'Make it an illustration', prompt: 'Re-imagine this as a flat editorial illustration with clean shapes, subtle texture and a limited palette, keeping the same composition.' },
    { label: 'Make it night', prompt: 'Change the time of day to night with believable ambient and artificial light. Keep everything else the same.' },
    { label: 'Zoom out', prompt: 'Zoom out to reveal more of the surrounding scene, extending the image naturally beyond its current edges. Keep the original content intact near the centre.' },
    { label: 'Close-up detail', prompt: 'Show a detailed close-up of the most interesting part of this image, in the same style, lighting and palette.' },
    { label: 'Sharpen & enrich detail', prompt: 'Increase fine detail, texture and clarity while keeping the composition, colours and content identical.' },
  ];

  const PLAN_SYSTEM =
    'You are a thoughtful art director who helps people explore a half-formed visual idea on a moodboard. ' +
    'You write vivid, concrete, self-contained image-generation prompts and short, useful notes. Never use generic filler.';
  const PLAN_SCHEMA = {
    type: 'OBJECT',
    properties: {
      title: { type: 'STRING' },
      summary: { type: 'STRING' },
      images: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            caption: { type: 'STRING' },
            prompt: { type: 'STRING' },
            aspectRatio: { type: 'STRING', enum: ['1:1', '3:4', '4:3', '16:9', '9:16'] },
          },
          required: ['caption', 'prompt', 'aspectRatio'],
        },
      },
      notes: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: { heading: { type: 'STRING' }, body: { type: 'STRING' } },
          required: ['heading', 'body'],
        },
      },
    },
    required: ['title', 'summary', 'images', 'notes'],
  };
  const planPrompt = (idea, hasImages) =>
    `Idea: """${idea}"""\n\n` +
    (hasImages ? 'The attached images are the person’s own references. Treat them as the starting point.\n\n' : '') +
    'Plan a moodboard that explores this idea from several angles.\n' +
    '- title: 2–5 evocative words, no quotation marks.\n' +
    '- summary: one sentence naming the direction.\n' +
    '- images: exactly 6. Cover different facets (a hero scene, a place, a materials or texture close-up, an object or detail, light and atmosphere) and include one deliberately contrasting interpretation. ' +
    'Each prompt stands alone (40–80 words) and names the medium or style, subject, composition, lighting and palette. No lettering in the images unless the idea asks for it. ' +
    'Pick an aspectRatio that suits each image and a 2–5 word caption.\n' +
    '- notes: exactly 2. First heading "Palette & materials", body of 4–5 lines formatted "- #RRGGBB name — where it is used". ' +
    'Second heading "Mood & motifs", body of 4–5 short lines each starting with "- ".';

  const STYLE_SYSTEM = 'You are an art director who writes crisp, practical style guides from reference images.';
  const STYLE_PROMPT =
    'Study these moodboard images and write a compact style guide for the direction they share, so someone could keep making work in it. ' +
    'Reply with exactly this markdown structure and nothing before it:\n' +
    '# Style guide\n## Mood\n- three short bullets\n## Palette\n- five lines formatted "#RRGGBB name — role"\n' +
    '## Materials & texture\n- two or three bullets\n## Light & composition\n- two or three bullets\n## Motifs\n- three bullets\n' +
    '## Reusable prompt\nOne paragraph (50–80 words) image-generation prompt that captures the direction.';

  /* ---------- naming ---------- */
  function nameFromPrompt(text) {
    let t = text.replace(/\s+/g, ' ').trim().replace(/^(an?|the)\s+/i, '');
    if (t.length > 44) t = t.slice(0, 44).replace(/[\s,;:.-]+\S*$/, '');
    t = t.replace(/[\s,;:.-]+$/, '');
    return t ? t[0].toUpperCase() + t.slice(1) : '';
  }

  /* ---------- prompt bar ---------- */
  function submitPrompt({ text, mode, count, ratio }) {
    if (!S.board) return false;
    if (!requireKey()) return false;
    const boardId = S.board.id;
    const sel = LB.board.selectedItems();
    const imgs = sel.filter((i) => i.type === 'image');
    const notes = sel.filter((i) => i.type === 'note' && (i.text || '').trim());
    const ar = ratio === 'auto' ? undefined : ratio;
    const n = LB.clamp(Number(count) || 1, 1, 4);

    if (mode === 'ideas') {
      if (!text) return false;
      brainstorm(text, imgs);
      return true;
    }
    if (!imgs.length) {
      if (!text) return false;
      LB.app.renameIfUntitled(nameFromPrompt(text));
      const context = notes.length ? `\n\nAlso draw on these notes:\n${notes.map((x) => x.text.trim()).join('\n---\n')}` : '';
      const rects = placeRow(Array.from({ length: n }, () => ghostSize(ar || '1:1')), notes.length ? LB.board.bounds(notes) : null);
      rects.forEach((rect) => imageJob({ boardId, rect, label: text, prompt: text + context, aspectRatio: ar, meta: { prompt: text, source: 'generated' } }));
      return true;
    }
    if (imgs.length === 1) {
      if (!text) return false;
      const src = imgs[0];
      const r = ar || LB.nearestRatio(src.natW || src.w, src.natH || src.h);
      const rects = placeRow(Array.from({ length: n }, () => ghostSize(r)), src);
      rects.forEach((rect) => imageJob({
        boardId, rect, label: `${LB.pad2(src.frame)} → ${text}`, prompt: text, refBlobIds: [src.blob], aspectRatio: ar,
        meta: { prompt: text, source: 'edit', parentFrames: [src.frame] },
      }));
      return true;
    }
    combine(imgs, text, { count: n, ratio: ar });
    return true;
  }

  function combine(imgs, text = '', { count = 1, ratio } = {}) {
    if (!requireKey()) return;
    const refs = imgs.slice(0, 14);
    const boardId = S.board.id;
    const rects = placeRow(Array.from({ length: count }, () => ghostSize(ratio || '1:1')), LB.board.bounds(imgs));
    const frames = refs.map((i) => i.frame);
    rects.forEach((rect) => imageJob({
      boardId, rect,
      label: text ? `Combine: ${text}` : `Combine ${frames.map(LB.pad2).join(' + ')}`,
      prompt: COMBINE(text, refs.length), refBlobIds: refs.map((i) => i.blob), aspectRatio: ratio,
      meta: { prompt: text || `Combine ${frames.map(LB.pad2).join(' + ')}`, source: 'combine', parentFrames: frames },
    }));
  }

  function moreLikeThis(imgs) {
    if (!requireKey() || !imgs.length) return;
    const boardId = S.board.id;
    const n = LB.clamp(Number(LB.settings.get().count) || 2, 1, 4);
    const first = imgs[0];
    const r = LB.nearestRatio(first.natW || first.w, first.natH || first.h);
    const refs = imgs.slice(0, 6);
    const prompt = refs.length === 1 ? VARIATION_ONE : VARIATION_MANY(refs.length);
    const rects = placeRow(Array.from({ length: n }, () => ghostSize(r)), LB.board.bounds(imgs));
    rects.forEach((rect) => imageJob({
      boardId, rect, label: `More like ${refs.map((i) => LB.pad2(i.frame)).join(' + ')}`, prompt,
      refBlobIds: refs.map((i) => i.blob), aspectRatio: r,
      meta: { prompt: 'More like this', source: 'variation', parentFrames: refs.map((i) => i.frame) },
    }));
  }

  function regenerate(it) {
    if (it.source === 'upload') { LB.toast('Regenerate works on generated images. Try “More like this” for your own uploads.'); return; }
    if (!requireKey()) return;
    const r = it.aspectRatio || LB.nearestRatio(it.natW || it.w, it.natH || it.h);
    const [rect] = placeRow([ghostSize(r)], it);
    imageJob({
      boardId: S.board.id, rect, label: it.prompt || 'Regenerate', prompt: it.apiPrompt || it.prompt,
      refBlobIds: it.refs || [], aspectRatio: it.aspectRatio || undefined,
      meta: { prompt: it.prompt, source: it.source, parentFrames: it.parentFrames },
    });
  }

  function quickEdit(it, preset) {
    if (!requireKey()) return;
    const r = LB.nearestRatio(it.natW || it.w, it.natH || it.h);
    const [rect] = placeRow([ghostSize(r)], it);
    imageJob({
      boardId: S.board.id, rect, label: `${LB.pad2(it.frame)} → ${preset.label}`, prompt: preset.prompt, refBlobIds: [it.blob],
      meta: { prompt: preset.label, source: 'edit', parentFrames: [it.frame] },
    });
  }

  function visualize(note) {
    if (!requireKey()) return;
    const text = (note.text || '').trim();
    if (!text) { LB.toast('This note is empty. Write something to visualize first.'); return; }
    const n = LB.clamp(Number(LB.settings.get().count) || 2, 1, 4);
    const ratio = LB.settings.get().ratio;
    const ar = ratio === 'auto' ? undefined : ratio;
    const rects = placeRow(Array.from({ length: n }, () => ghostSize(ar || '1:1')), note);
    const plain = text.replace(/^#+\s*/gm, '').replace(/^\s*[-*•]\s+/gm, '');
    rects.forEach((rect) => imageJob({
      boardId: S.board.id, rect, label: plain.slice(0, 140), prompt: `Create an image that visualizes this:\n${plain}`, aspectRatio: ar,
      meta: { prompt: plain.slice(0, 400), source: 'generated' },
    }));
  }

  function styleGuide(items) {
    if (!requireKey()) return;
    const pool = items && items.length ? items : S.board.items;
    const imgs = pool.filter((i) => i.type === 'image').slice(-10);
    if (!imgs.length) { LB.toast('Select or add some images first.'); return; }
    const anchor = LB.board.bounds(items && items.length ? items : imgs);
    const size = { w: 380, h: 320 };
    const p = LB.board.findSpot(size.w, size.h, { x: anchor.x + anchor.w + 40, y: anchor.y });
    const rect = { ...p, ...size };
    LB.board.ensureVisible(rect);
    textJob({
      boardId: S.board.id, rect, kind: 'text', label: `Style guide from ${imgs.length} image${imgs.length > 1 ? 's' : ''}`,
      run: async (signal) => {
        const blobs = (await Promise.all(imgs.map((i) => LB.store.getBlob(i.blob)))).filter(Boolean);
        const { value } = await LB.gemini.generateText({ system: STYLE_SYSTEM, prompt: STYLE_PROMPT, images: blobs, signal });
        return [{ id: LB.uid('n_'), type: 'note', variant: 'sticky', color: 'paper', text: value, x: rect.x, y: rect.y, w: 380, h: 320, createdAt: Date.now() }];
      },
    });
  }

  /* Plan a mini board (title, 6 image directions, 2 notes) from an idea. */
  function brainstorm(idea, refImgs = []) {
    if (!S.board || !requireKey()) return;
    const boardId = S.board.id;
    const all = LB.board.renderables();
    let origin;
    if (!all.length) {
      const c = LB.board.viewCenter();
      origin = { x: Math.round(c.x - 560), y: Math.round(c.y - 300) };
    } else {
      const b = LB.board.bounds(all);
      origin = { x: Math.round(b.x + b.w + 200), y: Math.round(b.y) };
    }
    const rect = { x: origin.x, y: origin.y, w: 460, h: 140 };
    LB.board.ensureVisible(rect);
    const refs = refImgs.slice(0, 6);
    textJob({
      boardId, rect, kind: 'plan', label: idea,
      run: async (signal) => {
        const blobs = (await Promise.all(refs.map((i) => LB.store.getBlob(i.blob)))).filter(Boolean);
        const { value: plan } = await LB.gemini.generateText({ system: PLAN_SYSTEM, prompt: planPrompt(idea, blobs.length > 0), images: blobs, schema: PLAN_SCHEMA, signal });
        return applyPlan(plan, idea, boardId, origin, refs);
      },
      // Notes were placed with estimated heights; restack them now they're measured.
      after: (items) => {
        const notes = items.filter((i) => i.variant === 'sticky').map((i) => LB.board.getItem(i.id)).filter(Boolean);
        for (let i = 1; i < notes.length; i++) notes[i].y = notes[i - 1].y + notes[i - 1].h + 24;
        if (notes.length > 1) LB.board.changed();
      },
    });
  }

  function applyPlan(plan, idea, boardId, origin, refs) {
    const title = String(plan.title || nameFromPrompt(idea)).replace(/["“”]/g, '').trim().slice(0, 80);
    const summary = String(plan.summary || '').trim();
    const heading = {
      id: LB.uid('n_'), type: 'note', variant: 'heading', text: `# ${title}${summary ? `\n${summary}` : ''}`,
      x: origin.x, y: origin.y, w: 680, h: 110, createdAt: Date.now(),
    };
    const shots = (Array.isArray(plan.images) ? plan.images : []).filter((p) => p && p.prompt).slice(0, 6);
    const gap = 24, top = origin.y + 150, maxW = 1100;
    let x = origin.x, y = top, rowH = 0;
    const rects = shots.map((p) => {
      const s = ghostSize(LB.RATIOS.includes(p.aspectRatio) ? p.aspectRatio : '1:1');
      if (x > origin.x && x + s.w > origin.x + maxW) { x = origin.x; y += rowH + gap; rowH = 0; }
      const r = { x, y, w: s.w, h: s.h };
      x += s.w + gap;
      rowH = Math.max(rowH, s.h);
      return r;
    });
    const right = rects.length ? Math.max(...rects.map((r) => r.x + r.w)) : origin.x + 600;
    const colors = ['yellow', 'blue', 'pink'];
    let ny = top;
    const notes = (Array.isArray(plan.notes) ? plan.notes : []).slice(0, 3).map((n, i) => {
      const text = `## ${String(n.heading || '').trim()}\n${String(n.body || '').trim()}`;
      const lines = text.split('\n').reduce((t, l) => t + Math.max(1, Math.ceil(l.length / 34)), 0);
      const it = { id: LB.uid('n_'), type: 'note', variant: 'sticky', color: colors[i % 3], text, x: right + 48, y: ny, w: 300, h: 48 + lines * 23, createdAt: Date.now() };
      ny += it.h + 24;
      return it;
    });
    const parentFrames = refs.map((r) => r.frame).filter(Boolean);
    // Image placeholders go on the board now; the notes arrive with the text job.
    rects.forEach((rect, i) => imageJob({
      boardId, rect, label: shots[i].caption || shots[i].prompt, prompt: shots[i].prompt,
      aspectRatio: LB.RATIOS.includes(shots[i].aspectRatio) ? shots[i].aspectRatio : undefined,
      meta: { prompt: shots[i].prompt, source: 'generated', parentFrames },
    }));
    if (S.board && S.board.id === boardId) {
      LB.app.renameIfUntitled(title);
      const cluster = LB.board.bounds([heading, ...rects, ...notes]);
      if (cluster) setTimeout(() => LB.board.fitTo(cluster), 30);
    } else {
      addToBoard(boardId, [], { name: title });
    }
    return [heading, ...notes];
  }

  /* ---------- palettes, uploads, downloads ---------- */
  async function palette(it) {
    try {
      const blob = await LB.store.getBlob(it.blob);
      const colors = await LB.extractPalette(blob, 5);
      if (!colors.length) { LB.toast('Couldn’t find colours in that image.'); return; }
      const w = Math.max(300, Math.min(it.w, 420)), h = 104;
      const p = LB.board.findSpot(w, h, { x: it.x, y: it.y + it.h + 28 });
      LB.board.addItems([{ id: LB.uid('p_'), type: 'palette', colors, x: p.x, y: p.y, w, h, sourceFrame: it.frame, createdAt: Date.now() }]);
    } catch (e) {
      LB.toast(`Couldn’t read that image: ${e.message}`, { type: 'error' });
    }
  }

  async function downscale(blob, maxSide) {
    const bmp = await LB.loadBitmap(blob);
    const W = bmp.width || bmp.naturalWidth, H = bmp.height || bmp.naturalHeight;
    const s = Math.min(1, maxSide / Math.max(W, H));
    const c = document.createElement('canvas');
    c.width = Math.round(W * s);
    c.height = Math.round(H * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    if (bmp.close) bmp.close();
    return new Promise((r) => c.toBlob(r, blob.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.9));
  }

  async function addFiles(files, point) {
    if (!S.board) return [];
    const boardId = S.board.id;
    const occ = rectsOf(LB.board.renderables());
    const items = [];
    let start = null;
    for (const f of files) {
      if (!f.type || !f.type.startsWith('image/')) continue;
      try {
        let blob = f;
        let { w: natW, h: natH } = await LB.imageSize(blob);
        if (Math.max(natW, natH) > 3072 || blob.size > 12e6) {
          blob = await downscale(blob, 3072);
          ({ w: natW, h: natH } = await LB.imageSize(blob));
        }
        const blobId = await LB.store.putBlob(blob);
        LB.store.primeURL(blobId, blob);
        const size = LB.displaySize(natW / natH);
        if (!start) {
          const c = point || LB.board.viewCenter();
          start = { x: c.x - size.w / 2, y: c.y - size.h / 2 };
        }
        const p = LB.board.findSpot(size.w, size.h, start, occ);
        const it = {
          id: LB.uid('i_'), type: 'image', x: p.x, y: p.y, w: size.w, h: size.h, natW, natH, blob: blobId, mime: blob.type,
          prompt: '', source: 'upload', filename: f.name || '', parentFrames: [], createdAt: Date.now(),
        };
        items.push(it);
        occ.push({ x: p.x, y: p.y, w: size.w, h: size.h });
        start = { x: p.x + size.w + 24, y: p.y };
      } catch (e) {
        LB.toast(`Couldn’t read ${f.name || 'that image'}. PNG, JPEG, WebP and GIF work best.`, { type: 'error' });
      }
    }
    if (!items.length || !S.board || S.board.id !== boardId) return [];
    LB.board.addItems(items);
    LB.board.ensureVisible(LB.board.bounds(items));
    return items;
  }

  async function addFromUrl(url, point) {
    try {
      const res = await fetch(url, { mode: 'cors' });
      const blob = await res.blob();
      if (!res.ok || !blob.type.startsWith('image/')) throw new Error('not an image');
      const name = url.split('/').pop().split('?')[0] || 'image';
      await addFiles([new File([blob], name, { type: blob.type })], point);
    } catch (e) {
      LB.toast('That site won’t share its image directly. Save it, then drop the file here.', { type: 'error' });
    }
  }

  const imageFilename = (it) => {
    const words = LB.slug(it.prompt || it.filename || it.source || 'image').slice(0, 40);
    return `${LB.pad2(it.frame || 0)}-${words}.${LB.extFor(it.mime)}`;
  };
  async function downloadImage(it) {
    const blob = await LB.store.getBlob(it.blob);
    if (blob) LB.downloadBlob(blob, `${LB.slug(S.board.name)}-${imageFilename(it)}`);
  }
  async function downloadImages(imgs) {
    if (imgs.length === 1) return downloadImage(imgs[0]);
    const files = [];
    for (const it of imgs) {
      const blob = await LB.store.getBlob(it.blob);
      if (blob) files.push({ name: imageFilename(it), blob });
    }
    const md = ['# ' + S.board.name, '', ...imgs.map((it) => `- ${imageFilename(it)} — ${it.source}${it.prompt ? `: ${it.prompt.replace(/\s+/g, ' ')}` : ''}`)].join('\n');
    files.push({ name: 'prompts.md', blob: new Blob([md], { type: 'text/markdown' }) });
    LB.downloadBlob(await LB.makeZip(files), `${LB.slug(S.board.name)}-images.zip`);
  }

  /* ---------- context toolbar contents ---------- */
  function noteStyleControl(n) {
    return {
      el: () => {
        const wrap = LB.h('div', { class: 'ctx-note-style' });
        const setNote = (patch) => { LB.board.checkpoint(); Object.assign(n, patch); LB.board.changed(); };
        const variants = [['text', 'Plain text'], ['heading', 'Heading'], ['sticky', 'Card']];
        for (const [v, label] of variants) {
          const on = (n.variant || 'text') === v;
          wrap.append(LB.h('button', {
            type: 'button', class: 'ctx-chip' + (on ? ' is-on' : ''), 'aria-pressed': String(on), title: label,
            onclick: (e) => { e.stopPropagation(); setNote({ variant: v, color: v === 'sticky' ? n.color || 'yellow' : n.color }); },
          }, v === 'text' ? 'Aa' : v === 'heading' ? 'H' : 'Card'));
        }
        if ((n.variant || 'text') === 'sticky') {
          for (const c of ['yellow', 'pink', 'blue', 'green', 'paper']) {
            wrap.append(LB.h('button', {
              type: 'button', class: 'ctx-dot' + (n.color === c ? ' is-on' : ''), dataset: { color: c }, title: c[0].toUpperCase() + c.slice(1),
              'aria-label': `${c} card`, onclick: (e) => { e.stopPropagation(); setNote({ color: c }); },
            }));
          }
        }
        return wrap;
      },
    };
  }

  function moreMenu(ids, extra = []) {
    return {
      icon: 'more', title: 'More',
      run: (btn) => LB.app.menu(btn, [
        ...extra,
        { label: 'Bring to front', run: () => { LB.board.checkpoint(); LB.board.bringToFront(ids); LB.board.changed(); } },
        { label: 'Send to back', run: () => { LB.board.checkpoint(); LB.board.sendToBack(ids); LB.board.changed(); } },
        { label: 'Duplicate', hint: '⌘D', run: () => LB.board.duplicate(ids) },
        '-',
        { label: 'Delete', hint: 'Del', danger: true, run: () => LB.board.removeItems(ids) },
      ]),
    };
  }

  function ctxFor(sel) {
    const imgs = sel.filter((i) => i.type === 'image');
    const notes = sel.filter((i) => i.type === 'note');
    const ids = sel.map((i) => i.id);
    const del = { icon: 'trash', title: 'Delete', danger: true, run: () => LB.board.removeItems(ids) };

    if (sel.length === 1 && imgs.length === 1) {
      const it = imgs[0];
      return [
        [
          { icon: 'pencil', label: 'Edit', title: 'Describe a change in the prompt bar', run: () => LB.app.focusPrompt() },
          { icon: 'layers', label: 'More like this', run: () => moreLikeThis([it]) },
          { icon: 'refresh', title: it.source === 'upload' ? 'Regenerate (generated images only)' : 'Regenerate', run: () => regenerate(it) },
          { icon: 'wand', title: 'Quick edits', run: (btn) => LB.app.menu(btn, QUICK_EDITS.map((p) => ({ label: p.label, run: () => quickEdit(it, p) }))) },
        ],
        [
          { icon: 'palette', title: 'Extract palette', run: () => palette(it) },
          { icon: 'doc', title: 'Write a style guide', run: () => styleGuide([it]) },
          { icon: 'info', title: 'Details', run: (btn) => LB.app.showInfo(btn, it) },
          { icon: 'download', title: 'Download', run: () => downloadImage(it) },
        ],
        [moreMenu(ids, [{ label: 'View large', hint: '↵', run: () => LB.app.openViewer(it.id) }, '-']), del],
      ];
    }
    if (imgs.length >= 2 && imgs.length === sel.length) {
      return [
        [
          { icon: 'combine', label: `Combine ${imgs.length}`, title: 'Blend these into one new image (or type directions in the prompt bar)', run: () => combine(imgs, '', { count: 1 }) },
          { icon: 'layers', label: 'More like these', run: () => moreLikeThis(imgs) },
          { icon: 'doc', label: 'Style guide', run: () => styleGuide(imgs) },
        ],
        [
          { icon: 'grid', title: 'Tidy up', run: () => LB.board.tidy(ids) },
          { icon: 'download', title: 'Download as .zip', run: () => downloadImages(imgs) },
        ],
        [moreMenu(ids), del],
      ];
    }
    if (sel.length === 1 && notes.length === 1) {
      const n = notes[0];
      return [
        [
          { icon: 'sparkles', label: 'Visualize', title: 'Generate images from this note', run: () => visualize(n) },
          { icon: 'pencil', title: 'Edit text (double-click)', run: () => LB.board.startEdit(n.id) },
        ],
        [noteStyleControl(n)],
        [moreMenu(ids, [{ label: 'Copy text', run: () => LB.copyText(n.text || '').then((ok) => LB.toast(ok ? 'Copied note text' : 'Couldn’t reach the clipboard')) }, '-']), del],
      ];
    }
    if (sel.length === 1 && sel[0].type === 'palette') {
      const p = sel[0];
      return [
        [{ icon: 'copy', label: 'Copy colours', run: () => LB.copyText(p.colors.join(' ')).then((ok) => LB.toast(ok ? 'Copied ' + p.colors.join(' ') : p.colors.join(' '))) }],
        [moreMenu(ids), del],
      ];
    }
    const group = [{ icon: 'grid', title: 'Tidy up', run: () => LB.board.tidy(ids) }];
    if (imgs.length) group.push({ icon: 'doc', label: 'Style guide', run: () => styleGuide(imgs) });
    return [group, [moreMenu(ids), del]];
  }

  LB.actions = {
    submitPrompt, combine, moreLikeThis, regenerate, quickEdit, visualize, styleGuide, brainstorm,
    palette, addFiles, addFromUrl, downloadImage, downloadImages, imageFilename, ctxFor, nameFromPrompt,
    QUICK_EDITS,
  };
})();
