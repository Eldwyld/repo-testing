#!/usr/bin/env bash
# Build JOI Forge and serve it from Google Colab (or any remote Linux box)
# through a public localtunnel URL.
#
# Usage, as ONE Colab cell (%%bash must be the first line; safe to re-run):
#   %%bash
#   set -e
#   DIR=/content/joi-forge-fork
#   if [ -d "$DIR/.git" ]; then
#     git -C "$DIR" pull --ff-only
#   else
#     git clone -b joi-forge https://github.com/Eldwyld/repo-testing "$DIR"
#   fi
#   bash "$DIR/scripts/colab-preview.sh"
#
# Options (environment variables):
#   PORT=5224        port for the preview server
#   TUNNEL=none      skip the tunnel (serve locally only)
#
# Production build + `vite preview` is used on purpose: the dev server makes
# hundreds of module requests that a tunnel turns into 502 errors.
set -euo pipefail

cd "$(dirname "$0")/.."
PORT="${PORT:-5224}"
TUNNEL="${TUNNEL:-localtunnel}"
LOG_DIR="${TMPDIR:-/tmp}"

say() { printf '\n== %s\n' "$*"; }

say "Checking this is the Forge fork"
if [ ! -d src/forge ] || [ ! -f src/forge/ui/StudioPage.tsx ]; then
  echo "ERROR: $(pwd) has no src/forge, so it is NOT the Forge fork (probably the original joi.how)."
  echo "Use the %%bash cell in docs/forge/colab.md, which clones the fork into /content/joi-forge-fork:"
  echo "  git clone -b joi-forge https://github.com/Eldwyld/repo-testing /content/joi-forge-fork"
  exit 1
fi
echo "branch: $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
echo "commit: $(git log --oneline -1 2>/dev/null || echo '?')"

say "Installing dependencies (npm ci)"
npm ci --no-audit --no-fund

say "Building"
npm run build

say "Starting preview server on port $PORT"
pkill -f "vite preview --port $PORT" 2>/dev/null || true
FORGE_ALLOWED_HOSTS=all setsid nohup npx vite preview --port "$PORT" --strictPort --host 0.0.0.0 \
  >"$LOG_DIR/forge-preview.log" 2>&1 < /dev/null &
for _ in $(seq 1 60); do
  curl -sf "http://localhost:$PORT/forge" >/dev/null && break
  sleep 1
done
if ! curl -sf "http://localhost:$PORT/forge" >/dev/null; then
  echo "ERROR: preview server did not start. Log:"
  cat "$LOG_DIR/forge-preview.log"
  exit 1
fi
echo "serving http://localhost:$PORT/forge"

if [ "$TUNNEL" = "none" ]; then
  say "Done (no tunnel). Open http://localhost:$PORT/forge"
  exit 0
fi

say "Opening a public tunnel (localtunnel)"
pkill -f "localtunnel --port $PORT" 2>/dev/null || true
rm -f "$LOG_DIR/forge-tunnel.log"
setsid nohup npx --yes localtunnel --port "$PORT" \
  >"$LOG_DIR/forge-tunnel.log" 2>&1 < /dev/null &
URL=""
for _ in $(seq 1 60); do
  URL=$(grep -o 'https://[^ ]*' "$LOG_DIR/forge-tunnel.log" 2>/dev/null | head -1 || true)
  [ -n "$URL" ] && break
  sleep 1
done
if [ -z "$URL" ]; then
  echo "ERROR: tunnel did not start. Log:"
  cat "$LOG_DIR/forge-tunnel.log" || true
  exit 1
fi

PASSWORD=$(curl -s https://loca.lt/mytunnelpassword || true)
say "Ready"
echo "Open:            $URL/forge"
echo "Tunnel password: ${PASSWORD:-(see https://loca.lt/mytunnelpassword)}"
echo
echo "The tunnel URL is public while this runtime is alive. Your settings and"
echo "session logs stay in your own browser; the server only hosts static files."
