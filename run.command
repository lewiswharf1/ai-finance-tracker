#!/bin/bash
# Double-click to start the finance tracker. Rebuilds the frontend if it has
# changed, serves it from FastAPI on a single port, and opens the browser.
set -e

cd "$(dirname "$0")"
ROOT="$PWD"

PORT=8000
URL="http://localhost:$PORT"
PY="$ROOT/backend/venv/bin/python"

# Already running from an earlier launch — just open it.
if curl -fs -o /dev/null "$URL/health"; then
  open "$URL"
  exit 0
fi

if [ ! -x "$PY" ]; then
  echo "Setting up the Python environment…"
  python3 -m venv backend/venv
  "$PY" -m pip install -q -r backend/requirements.txt
fi

if [ ! -d node_modules ]; then
  echo "Installing frontend dependencies…"
  npm install
fi

# Rebuild only when something has changed since the last build.
SOURCES="src index.html package.json vite.config.js tailwind.config.js postcss.config.js"
if [ ! -f dist/index.html ] || [ -n "$(find $SOURCES -newer dist/index.html 2>/dev/null)" ]; then
  echo "Building frontend…"
  npm run build
fi

echo "Starting server…"
cd backend                       # so the SQLite path in database.py resolves
"$PY" -m uvicorn main:app --port "$PORT" &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null' EXIT

for _ in $(seq 1 60); do
  if curl -fs -o /dev/null "$URL/health"; then
    open "$URL"
    echo
    echo "Finance tracker running at $URL"
    echo "Close this window or press Ctrl-C to stop it."
    wait $SERVER_PID
    exit 0
  fi
  kill -0 $SERVER_PID 2>/dev/null || break
  sleep 0.5
done

echo
echo "Server failed to start — see the output above."
exit 1
