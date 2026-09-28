# Mixboard Exporter

Mixboard shuts down on **September 28, 2026**, and the "Download as PNG" menu item from the
shutdown email isn't there for everyone. This script saves your boards anyway: it runs inside
your logged-in Mixboard tab, collects every image the page loads or shows, and downloads them
as a ZIP.

It doesn't depend on Mixboard's internal page layout. It watches the images and data the app
loads, so it keeps working even if the page structure changes. Everything happens in your
browser, and nothing is sent anywhere else.

## What you get

```
mixboard-export-<project>-<date>.zip
├── index.html                 open this to browse every saved image, grouped by board
├── boards/<board>/001.png …   the original image files
├── boards/<board>/board-text.txt   text that was on screen (titles, notes, prompts)
├── canvas-snapshots/          snapshots of drawing canvases, if any
├── api/                       raw board data the app loaded (layouts, prompts, image lists)
├── manifest.json              which file came from which URL
└── failed-urls.txt            only if some images couldn't be re-downloaded (see below)
```

## Quick start (no install, about 2 minutes)

1. In **Chrome, Edge or Firefox**, open <https://mixboard.google.com/projects> and open a project.
2. Open the developer console:
   - Windows/Linux: `Ctrl`+`Shift`+`J` (Firefox: `Ctrl`+`Shift`+`K`)
   - Mac: `Cmd`+`Option`+`J` (Firefox: `Cmd`+`Option`+`K`)
3. Open [`mixboard-exporter.user.js`](mixboard-exporter.user.js), copy **all** of it, paste it
   into the console, and press `Enter`.
   - Chrome may block the paste and ask you to type `allow pasting` first. Type it, press
     `Enter`, then paste again.
4. A **Mixboard Exporter** panel appears in the bottom-right corner.
5. **Open every board** in the project, one after another. On each board, zoom out (or use
   "fit to screen") until every image has loaded. The "Images found" counter goes up as images
   appear.
   - Optional: before opening a board, type its name in *Folder for images seen from now on*
     so its images get their own folder. Otherwise the page title is used.
6. Click **Download ZIP**.
7. Repeat for your other projects. **Download before you leave a project or reload the page.**
   A reload clears the script and everything it collected. If you leave with images you haven't
   downloaded yet, the browser warns you.

## Optional: capture everything automatically (Tampermonkey)

When you paste the script into the console, it only sees data the app loads *after* the paste.
It still finds every image already on screen. To catch the board data from the moment the page
starts loading:

1. Install [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/).
2. Create a new script, replace its contents with `mixboard-exporter.user.js`, and save.
   (In Chrome you may need to turn on "Allow user scripts" for the extension, or Developer mode
   on `chrome://extensions`.)
3. Reload Mixboard. The panel appears automatically. Then follow steps 5–7 above.

## Troubleshooting

- **"Images found" stays at 0.** Make sure the console's context selector (top-left of the
  console, usually labelled `top`) is set to `top`. Then click **Scan page**.
- **Some images are missing.** Zoom out or scroll so the missing images actually load, then
  click **Download ZIP** again. Each download is a complete snapshot of everything found so far.
- **Images you want are too small and get skipped.** Lower *Skip images smaller than* (the
  default of 150 px filters out icons and avatars).
- **`failed-urls.txt` is in the ZIP.** The browser wasn't allowed to re-download those images
  from another site. Run `python3 download_failed.py mixboard-export-….zip` and they'll be
  saved to a `recovered/` folder next to the ZIP. If a link has already expired, open it
  in your browser while you're still logged in and use right-click → Save image as.
- **Chrome asks to "download multiple files".** This happens with very large exports, which
  are split into several ZIP parts. Allow it.

## Privacy

The `api/` folder contains the raw data your Mixboard session loaded, which can include
account identifiers. Keep the ZIP private if you're unsure.
