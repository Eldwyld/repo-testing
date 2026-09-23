/* Lightbox — Gemini API client (browser → generativelanguage.googleapis.com).
   Image generation/editing uses the "Nano Banana" family; planning and style
   guides use a Gemini text model. */
(function () {
  'use strict';
  const LB = window.LB;
  const BASE = 'https://generativelanguage.googleapis.com/v1beta';

  const IMAGE_MODELS = [
    { id: 'gemini-3.1-flash-image-preview', label: 'Nano Banana 2 · fast, up to 14 references' },
    { id: 'gemini-3-pro-image-preview', label: 'Nano Banana Pro · best quality, slower' },
    { id: 'gemini-2.5-flash-image', label: 'Nano Banana (original)' },
    { id: 'gemini-3.1-flash-lite-image', label: 'Nano Banana 2 Lite · cheapest' },
  ];
  const TEXT_MODELS = [
    { id: 'gemini-flash-latest', label: 'Gemini Flash · latest' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash' },
  ];

  class ApiError extends Error {
    constructor(message, status = 0, code = '') {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.code = code;
    }
  }

  function friendly(err) {
    if (!err) return 'Something went wrong.';
    if (err.name === 'AbortError') return 'Cancelled.';
    if (!(err instanceof ApiError)) return err.message || String(err);
    const m = err.message || '';
    if (err.code === 'NO_KEY') return m;
    if (err.status === 400 && /api key/i.test(m)) return 'Google rejected your API key. Check it in Settings.';
    if (err.status === 403) return 'This API key isn’t allowed to use that model. Check the key’s project in Google AI Studio.';
    if (err.status === 404) return `Model not found for your key. Pick another model in Settings. (${m})`;
    if (err.status === 429) return 'Quota or rate limit reached. Wait a minute, or check billing for your key. Image models usually need a paid tier.';
    if (err.status >= 500) return 'Gemini is busy or had an error. Try again in a moment.';
    return m;
  }

  async function request(path, body, { signal } = {}) {
    const key = (LB.settings.get().apiKey || '').trim();
    if (!key) throw new ApiError('Add your Gemini API key in Settings to generate.', 0, 'NO_KEY');
    let res;
    try {
      res = await fetch(`${BASE}/${path}`, {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'x-goog-api-key': key, 'Content-Type': 'application/json' } : { 'x-goog-api-key': key },
        body: body ? JSON.stringify(body) : undefined,
        signal,
      });
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      throw new ApiError('Couldn’t reach the Gemini API. Check your connection.', 0, 'NETWORK');
    }
    let json = null;
    try { json = await res.json(); } catch (e) { /* non-JSON error page */ }
    if (!res.ok) {
      const e = (json && json.error) || {};
      throw new ApiError(e.message || `HTTP ${res.status}`, res.status, e.status || '');
    }
    return json;
  }

  /* Try the configured model first; if Google says it doesn't exist (404),
     walk the known list and remember whichever works. Model names churn. */
  async function withModel(kind, fn) {
    const key = kind === 'image' ? 'imageModel' : 'textModel';
    const primary = (LB.settings.get()[key] || '').trim();
    const known = (kind === 'image' ? IMAGE_MODELS : TEXT_MODELS).map((m) => m.id);
    const order = [primary, ...known].filter((v, i, a) => v && a.indexOf(v) === i);
    let lastErr = null;
    for (const model of order) {
      try {
        const out = await fn(model);
        if (model !== primary && LB.settings.get()[key] === primary) {
          LB.settings.set({ [key]: model });
          LB.toast(`“${primary}” isn’t available to your key, so Lightbox switched to ${model}.`);
        }
        return { out, model };
      } catch (e) {
        lastErr = e;
        if (!(e instanceof ApiError && e.status === 404)) throw e;
      }
    }
    throw lastErr;
  }

  function partsOf(json) {
    const cand = json && json.candidates && json.candidates[0];
    return { cand, parts: (cand && cand.content && cand.content.parts) || [] };
  }

  function pickImage(json) {
    const { cand, parts } = partsOf(json);
    let found = null, text = '';
    for (const p of parts) {
      const d = p.inlineData || p.inline_data;
      if (p.thought) continue; // Gemini 3 image models can emit draft "thought" images
      if (d && d.data) found = d; // keep the last final image
      else if (p.text) text += p.text;
    }
    if (found) return { blob: LB.base64ToBlob(found.data, found.mimeType || found.mime_type || 'image/png'), text };
    const block = json && json.promptFeedback && json.promptFeedback.blockReason;
    const reason = block || (cand && cand.finishReason) || '';
    let msg = 'The model didn’t return an image.';
    if (block || /SAFETY|PROHIBITED|BLOCK|RECITATION|IMAGE_OTHER|SPII/i.test(reason)) {
      msg = `The model declined this one (${reason}). Try rephrasing it.`;
    }
    if (text.trim()) msg += ` It said: “${text.trim().slice(0, 220)}”`;
    throw new ApiError(msg, 200, 'NO_IMAGE');
  }

  async function generateImage({ prompt, images = [], aspectRatio, signal }) {
    const s = LB.settings.get();
    const parts = [];
    for (const b of images) parts.push({ inlineData: await LB.prepareImageForApi(b) });
    parts.push({ text: prompt });
    const generationConfig = { responseModalities: ['TEXT', 'IMAGE'] };
    const imageConfig = {};
    if (aspectRatio && aspectRatio !== 'auto') imageConfig.aspectRatio = aspectRatio;
    if (s.imageSize && s.imageSize !== 'default') imageConfig.imageSize = s.imageSize;
    if (Object.keys(imageConfig).length) generationConfig.imageConfig = imageConfig;
    const body = { contents: [{ role: 'user', parts }], generationConfig };
    const { out, model } = await withModel('image', (m) => request(`models/${m}:generateContent`, body, { signal }));
    return { ...pickImage(out), model };
  }

  function parseJsonLoose(text) {
    const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    try { return JSON.parse(t); } catch (e) { /* fall through */ }
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
    throw new ApiError('The model’s answer wasn’t valid JSON. Try again.', 200, 'BAD_JSON');
  }

  async function generateText({ system, prompt, images = [], schema, signal }) {
    const parts = [];
    for (const b of images) parts.push({ inlineData: await LB.prepareImageForApi(b, 1024) });
    parts.push({ text: prompt });
    const body = { contents: [{ role: 'user', parts }] };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    if (schema) body.generationConfig = { responseMimeType: 'application/json', responseSchema: schema };
    const { out, model } = await withModel('text', (m) => request(`models/${m}:generateContent`, body, { signal }));
    const { cand, parts: outParts } = partsOf(out);
    const text = outParts.filter((p) => p.text && !p.thought).map((p) => p.text).join('');
    if (!text.trim()) {
      const reason = (out.promptFeedback && out.promptFeedback.blockReason) || (cand && cand.finishReason) || 'empty';
      throw new ApiError(`The model returned no text (${reason}).`, 200, 'NO_TEXT');
    }
    return { value: schema ? parseJsonLoose(text) : text.trim(), model };
  }

  async function listModels() {
    const out = [];
    let pageToken = '';
    for (let i = 0; i < 5; i++) {
      const json = await request(`models?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`);
      out.push(...(json.models || []));
      if (!json.nextPageToken) break;
      pageToken = json.nextPageToken;
    }
    const gen = out.filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'));
    const id = (m) => m.name.replace(/^models\//, '');
    const isImage = (m) => /image/i.test(id(m)) && !/imagen/i.test(id(m));
    const isText = (m) => !isImage(m) && /gemini/i.test(id(m)) && !/tts|embedding|audio|live|veo|robotics|computer-use/i.test(id(m));
    return {
      image: gen.filter(isImage).map((m) => ({ id: id(m), label: m.displayName || id(m) })),
      text: gen.filter(isText).map((m) => ({ id: id(m), label: m.displayName || id(m) })),
    };
  }

  LB.gemini = { IMAGE_MODELS, TEXT_MODELS, ApiError, friendly, generateImage, generateText, listModels };
})();
