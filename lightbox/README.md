# Lightbox

A personal, Mixboard-style AI concepting canvas. It's an infinite board where you generate, edit, combine and arrange images with Google's **Nano Banana** image models, alongside notes, palettes and style guides.

It's a static web app with no build step and no server. It runs entirely in your browser and talks directly to the Gemini API with your own key.

## Run it

1. Open `lightbox/index.html` in Chrome, Edge, Firefox or Safari. Double-clicking the file works.
   If your browser is strict about local files, serve the folder instead:
   ```sh
   cd lightbox && python3 -m http.server 8000   # then open http://localhost:8000
   ```
2. Click **Settings** (the sliders icon) and paste a Gemini API key from
   [Google AI Studio](https://aistudio.google.com/apikey). Click **Check key & load models**.
   Image generation usually needs billing enabled on the key's Google Cloud project.
3. Type an idea and hit **Plan a board**, or start from a blank board.

## What it does

| Mixboard idea | In Lightbox |
|---|---|
| Start from a prompt | **Plan a board** / **Ideas** mode: a text model plans a title, 6 varied image directions and palette/mood notes, then the images generate in place |
| Generate images | Prompt bar in **Images** mode, 1–4 at a time, with a choice of aspect ratio |
| Bring your own references | Drag and drop, paste (⌘/Ctrl V), or the upload tool |
| Edit in plain language | Select an image, then type "make it dusk", "remove the people"… |
| Combine | Select 2 or more images → **Combine**, or type how they should blend |
| More like this / regenerate | On the selection toolbar. Results land beside the source, which is never overwritten |
| Quick edits | Remove background, photo/illustration, night, zoom out, close-up, sharpen |
| Text on the board | Double-click the canvas for text; cards (sticky notes) and headings; light markdown (`#`, `##`, `- `), and `#RRGGBB` shows a swatch |
| Understand a direction | **Style guide** turns selected images (or the whole board) into mood/palette/motif notes plus a reusable prompt |
| Branch directions | Board menu → **Branch into a new board** |
| Export | Board as PNG, all images as .zip (with a `prompts.md`), or a `.lightbox.json` board file you can re-import anywhere |

Extras: **Extract palette** (computed locally, no API call), **Visualize** a note, **Tidy up** a selection into rows, an image viewer with each frame's prompt and history, undo/redo, and light/dark themes.

Every image gets a frame number, like a contact sheet. Derived images show where they came from, e.g. `07 ← 03` means frame 07 was made from 03.

## Controls

| | |
|---|---|
| Pan | Scroll / two-finger drag, hold **Space** and drag, middle-drag, or the hand tool (**H**) |
| Zoom | **⌘/Ctrl + scroll** or pinch, **+ / −**, **⌘/Ctrl 0** for 100%, **Shift 1** to fit everything, **Shift 2** to fit the selection |
| Select | Click, **Shift**-click to add, drag on empty canvas for a marquee, **⌘/Ctrl A** |
| Edit | **Enter** edits a note / opens an image; **/** jumps to the prompt bar; **↑** recalls the last prompt |
| Arrange | Drag, corner handle to resize, arrow keys to nudge (Shift = 10px), **⌘/Ctrl D** duplicate, **Delete** |
| History | **⌘/Ctrl Z**, **Shift ⌘/Ctrl Z** |
| Tools | **V** select, **T** text, **S** card, **U** upload |

If you use a mouse wheel, set **Settings → Scroll wheel → Zooms**.

## Models

- **Image:** defaults to `gemini-3.1-flash-image-preview` (Nano Banana 2). `gemini-3-pro-image-preview` (Nano Banana Pro) is sharper and supports 2K/4K output (Settings → Output size); `gemini-2.5-flash-image` is the original Nano Banana.
- **Text** (planning, style guides): `gemini-flash-latest`.
- Model names change often. **Check key & load models** lists what your key can use. If a model disappears (404), Lightbox falls back to the next known one and tells you.

## Where your stuff lives

- Boards and images are stored in this browser's IndexedDB. Clearing site data deletes them, so use **Save board file** for backups.
- The API key is kept in this browser's localStorage and sent only to `generativelanguage.googleapis.com`.
- Anything you generate from, including uploaded references, is sent to Google's Gemini API.

## Files

```
index.html      markup for the home screen, board, dialogs
styles.css      design tokens (light/dark) and all styles
js/util.js      helpers: icons, images, palette k-means, markdown, zip writer, toasts
js/store.js     settings + IndexedDB persistence
js/gemini.js    Gemini REST client with model fallback
js/canvas.js    infinite canvas: camera, render, selection, drag/resize, undo
js/actions.js   generation queue, edit/combine/variations, planning, uploads
js/app.js       routing, home, prompt bar, viewer, settings, export/import, shortcuts
```
