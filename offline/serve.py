#!/usr/bin/env python3
"""Serve the offline JOI Forge build on this computer only.

Usage:  python3 serve.py            (opens http://localhost:5224/forge)
        python3 serve.py --no-open  (do not open a browser)

* Binds to 127.0.0.1 only, so nothing on your network can reach it.
* Serves the files in ./app and nothing else (no directory listings,
  no paths outside ./app).
* Unknown routes fall back to index.html so links like /forge work.
* Always uses port 5224: your library and settings are stored by the browser
  per address, so a different port would look like an empty library.
"""
import http.server
import mimetypes
import os
import socket
import sys
import threading
import webbrowser
from urllib.parse import unquote, urlsplit

HOST = "127.0.0.1"
PORT = int(os.environ.get("FORGE_OFFLINE_PORT", "5224"))  # override only for tests
ROOT = os.path.realpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "app"))
START_URL = f"http://localhost:{PORT}/forge"

TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".webmanifest": "application/manifest+json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".txt": "text/plain; charset=utf-8",
    ".woff2": "font/woff2",
    ".wasm": "application/wasm",
}


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "JOIForgeOffline"

    def log_message(self, *args):  # keep the terminal quiet
        pass

    def _resolve(self):
        path = unquote(urlsplit(self.path).path)
        candidate = os.path.realpath(os.path.join(ROOT, path.lstrip("/")))
        if candidate != ROOT and not candidate.startswith(ROOT + os.sep):
            return None  # outside ./app
        if os.path.isdir(candidate):
            candidate = os.path.join(candidate, "index.html")
        if os.path.isfile(candidate):
            return candidate
        # SPA fallback for app routes (no file extension), 404 for missing files.
        if "." not in os.path.basename(path):
            return os.path.join(ROOT, "index.html")
        return None

    def _send(self, include_body):
        target = self._resolve()
        if target is None:
            self.send_error(404)
            return
        ext = os.path.splitext(target)[1].lower()
        ctype = TYPES.get(ext) or mimetypes.guess_type(target)[0] or "application/octet-stream"
        with open(target, "rb") as handle:
            body = handle.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        if include_body:
            self.wfile.write(body)

    def do_GET(self):
        self._send(True)

    def do_HEAD(self):
        self._send(False)


def already_running():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.settimeout(0.5)
        return probe.connect_ex((HOST, PORT)) == 0


def main():
    open_browser = "--no-open" not in sys.argv
    if not os.path.isfile(os.path.join(ROOT, "index.html")):
        sys.exit(f"Cannot find the app files in {ROOT}")
    if already_running():
        print(f"JOI Forge is already running. Opening {START_URL}")
        if open_browser:
            webbrowser.open(START_URL)
        return
    httpd = http.server.ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"JOI Forge (offline) is running at {START_URL}")
    print("Only this computer can reach it. Close this window or press Ctrl+C to stop.")
    if open_browser:
        threading.Timer(0.5, lambda: webbrowser.open(START_URL)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
