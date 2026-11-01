# Running JOI Forge from Google Colab

Colab is a remote machine, so it can't show `localhost` in your browser. The script below builds the app,
serves the production build, and opens a public [localtunnel](https://github.com/localtunnel/localtunnel)
URL. It serves the production build because the dev server makes many module requests that tunnels answer
with `502 Bad Gateway`, which leaves a blank page.

## One cell

Run this in a **code cell**. The `!` prefix sends each line to the shell, not to Python.

```
!git clone -b joi-forge https://github.com/Eldwyld/repo-testing /content/joi-forge-fork
!bash /content/joi-forge-fork/scripts/colab-preview.sh
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

- **Re-running:** run the cell again. A clone into an existing folder fails, so update it first with
  `!git -C /content/joi-forge-fork pull` and then run only the `bash` line.
- **Public link:** the tunnel URL is public while the Colab runtime is alive. Settings and session logs are
  stored in _your browser_, not on the Colab machine.
- **Other hosts:** the preview server only accepts unknown hostnames when started with
  `FORGE_ALLOWED_HOSTS=all` (the script does this) or a comma-separated list such as
  `FORGE_ALLOWED_HOSTS=.loca.lt`. Normal `npm run dev` stays limited to localhost.
- **No tunnel:** `TUNNEL=none bash scripts/colab-preview.sh` builds and serves locally only.
