#!/bin/bash
# Double-click to start the offline JOI Forge build (macOS). Close the window to stop.
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then
  exec python3 serve.py
fi
echo "Python 3 is needed to run JOI Forge offline."
echo "Install it from https://www.python.org/downloads/ (or run: xcode-select --install), then try again."
read -r -p "Press Enter to close"
