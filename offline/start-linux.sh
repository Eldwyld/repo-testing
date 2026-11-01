#!/bin/sh
# Start the offline JOI Forge build (Linux). Press Ctrl+C to stop.
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then
  exec python3 serve.py "$@"
fi
echo "Python 3 is needed to run JOI Forge offline (e.g. sudo apt install python3)."
exit 1
