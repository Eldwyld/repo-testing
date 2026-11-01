JOI Forge - offline build
=========================

This folder runs JOI Forge entirely on your own computer.

  * Only images and videos from this computer are used (no e621, no online services).
  * The app is served to this computer only (http://localhost:5224). Nothing on
    your network can reach it, and the page itself is locked so the browser
    refuses any connection to the internet.
  * Your settings, imported media and session logs stay in your browser's
    storage for http://localhost:5224. Nothing is uploaded.

Adult content. 18+ only.


START
-----

Windows : double-click  "Start JOI Forge (Windows).bat"
          (uses PowerShell, which is built into Windows - nothing to install.
           If Windows SmartScreen warns about the file, choose "More info" ->
           "Run anyway", or right-click the file -> Properties -> Unblock.)

macOS   : double-click  "Start JOI Forge (Mac).command"
          (needs Python 3. If macOS says it cannot be opened, right-click it ->
           Open. If it is not executable, run in Terminal:
             chmod +x "Start JOI Forge (Mac).command")

Linux   : run  ./start-linux.sh     (needs Python 3)

Any OS with Python 3:  python3 serve.py

Your browser opens http://localhost:5224/forge. Keep the launcher window open
while you use JOI Forge; close it to stop.


ADD YOUR IMAGES AND VIDEOS
--------------------------

In JOI Forge Studio, on the Setup tab, use "Add images / videos..." or
"Add a folder...". Supported: jpg, jpeg, png, gif, webp, bmp, svg, mp4, webm,
mov, avi, mkv (video playback depends on what your browser supports; mp4 and
webm are safest). Files are copied into the browser's storage, so the
originals can be moved afterwards.

Under Settings -> Media you can see every item, remove items, and tag them for
media associations.


GOOD TO KNOW
------------

  * Always start JOI Forge with the launcher so the address stays
    http://localhost:5224 - a different address means a different (empty)
    library in the browser.
  * Clearing your browser's site data for localhost removes the library,
    settings and session logs. Export what you want to keep first
    (Studio -> Import & export, and each session's Export).
  * Toys (Intiface Central) still work: they connect over a local
    websocket on this computer.
