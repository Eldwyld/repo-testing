# Running JOI Forge from Google Colab

Colab is a remote machine, so it can't show `localhost` in your browser. The script below builds the app,
serves the production build, and opens a public [localtunnel](https://github.com/localtunnel/localtunnel)
URL. It serves the production build because the dev server makes many module requests that tunnels answer
with `502 Bad Gateway`, which leaves a blank page.

## One cell

Paste this into a **code cell**. `%%bash` must be the very first line: it runs the whole cell as a shell
script instead of Python. The cell is safe to re-run; it clones the fork the first time and pulls updates
after that.

```
%%bash
set -e
DIR=/content/joi-forge-fork
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" pull --ff-only
else
  git clone -b joi-forge https://github.com/Eldwyld/repo-testing "$DIR"
fi
bash "$DIR/scripts/colab-preview.sh"
```

When it finishes, it prints two lines:

```
Open:            https://<random>.loca.lt/forge
Tunnel password: <an IP address>
```

Open that link. localtunnel first shows a reminder page; paste the tunnel password there. The app then asks you to confirm you are 18 or older (the original app's gate, also applied to Forge pages).

## Check you are on the fork

- The page at the printed link must say **JOI Forge Studio**, with the sticker emblem beside the title.
- The top bar shows `build <commit>`. It should match the latest commit on the `joi-forge` branch.
- The site root (`/`) is the original joi.how app, kept as "classic mode". Use the **Open JOI Forge Studio →**
  button at the top of that page, or go straight to `/forge`.

If the script prints `ERROR: ... is NOT the Forge fork`, the folder holds the original joi.how. Use the clone
line above, which uses a new folder, `/content/joi-forge-fork`.

## Notes

- **Re-running / updating:** run the same cell again. It pulls the latest `joi-forge` commit, rebuilds, and
  restarts the server and tunnel (the tunnel URL changes each time).
- **`!` instead of `%%bash`:** single lines also work with a `!` prefix (e.g.
  `!bash /content/joi-forge-fork/scripts/colab-preview.sh`), but multi-line shell logic needs `%%bash`.
- **Public link:** the tunnel URL is public while the Colab runtime is alive. Settings and session logs are
  stored in _your browser_, not on the Colab machine.
- **Other hosts:** the preview server only accepts unknown hostnames when started with
  `FORGE_ALLOWED_HOSTS=all` (the script does this) or a comma-separated list such as
  `FORGE_ALLOWED_HOSTS=.loca.lt`. Normal `npm run dev` stays limited to localhost.
- **No tunnel:** change the last line to `TUNNEL=none bash "$DIR/scripts/colab-preview.sh"` to build and
  serve locally only.
