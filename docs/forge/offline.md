# Offline version (local images and videos only)

The offline version is a folder you download once and run on your own computer, with no internet connection
needed. It uses only images and videos from your computer.

|                         | Normal build                       | Offline build                                                                                                                       |
| ----------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Media sources           | e621, device files                 | **Device files only** (images, GIFs, videos)                                                                                        |
| Network                 | Online media services              | **None.** The page carries a Content-Security-Policy, so the browser itself refuses every request to anything except this computer. |
| Icons                   | Bundled (brand logos from the CDN) | Bundled, including stand-ins for brand logos                                                                                        |
| How it runs             | Any web host, `npm run dev`, Colab | Double-click a launcher; served at `http://localhost:5224` to this computer only                                                    |
| Toys (Intiface Central) | Yes                                | Yes (local websocket to `ws://localhost`)                                                                                           |

## Get it

**From GitHub, with nothing installed:** every push to the `joi-forge` branch runs the **Offline package**
workflow. Open the repository's **Actions** tab, choose the latest **Offline package** run, and download the
`joi-forge-offline` artifact. GitHub delivers it as a zip that contains `joi-forge-offline.zip`; unzip that
inner file.

**Or build it yourself** (Node 20+):

```bash
npm ci
```

```bash
npm run build:offline
```

That creates the folder `dist-offline/` and, when the `zip` command exists, `release/joi-forge-offline.zip`.

## Start it

| System  | Double-click                    | Needs                                    |
| ------- | ------------------------------- | ---------------------------------------- |
| Windows | `Start JOI Forge (Windows).bat` | Nothing; it uses the built-in PowerShell |
| macOS   | `Start JOI Forge (Mac).command` | Python 3                                 |
| Linux   | `start-linux.sh`                | Python 3                                 |

Your browser opens `http://localhost:5224/forge`. Keep the launcher window open while you use it, and close it
to stop. The bundled `README.txt` covers first-run security prompts (Windows SmartScreen, macOS Gatekeeper).

## Add your media

In **JOI Forge Studio › Setup › Images & videos**, use **Add images / videos…** or **Add a folder…**. Supported
types are jpg, jpeg, png, gif, webp, bmp, svg, mp4, webm, mov, avi and mkv. Which videos play depends on your
browser; mp4 (H.264) and webm are the safest. The files are copied into the browser's own storage (IndexedDB)
for `localhost:5224`, so you can move the originals afterwards. **Settings › Media** lists every item, lets you
remove items, and tags items for media associations.

The same panel exists in the normal build, where the files also stay in the browser.

## How "offline" is enforced

- **Code:** the online media tabs are not shown, and the slideshow ignores anything that isn't stored on this
  device, even if an old configuration lists online items (`src/game/pipes/playableImages.ts`).
- **Browser policy:** `index.html` carries a strict Content-Security-Policy (see `vite.config.ts`, mode
  `offline`). Requests may only go to this page's own address, `data:`/`blob:` URLs, and websockets on
  `localhost` (for toys). The image resizer additionally needs `'wasm-unsafe-eval'` and inline workers; both
  run locally and cannot open connections.
- **Server:** the launchers bind to `127.0.0.1`/`localhost` only and serve nothing outside the `app` folder.
- **Tested:** `e2e/offline-smoke.cjs` loads the packaged app with every non-local request blocked and recorded.
  It imports an image and a video, plays a session, and fails on any external request, policy violation or
  page error. CI runs it on every push.

## Good to know

- **Use the same address.** Always start with the launcher. The browser keeps your library, settings and
  session logs per address, so `http://localhost:5224` must stay the same. A different port shows an empty
  library.
- **Clearing site data deletes everything.** Clearing your browser's site data for `localhost` removes the
  library, settings and logs. Export first (Studio › Import & export, and each session's Export).
- **Moving from the online build:** the online and offline versions live at different addresses, so they don't
  share data. Move settings with Export/Import. Media has to be re-added from your files.

## What was not tested

The Python launcher and the packaged app were run here on Linux and pass the offline smoke test.
`serve.ps1` (Windows) and the macOS `.command` launcher **were not run**, because neither Windows nor macOS was
available. They are short and use only built-in tools, but please report any problem starting them.
