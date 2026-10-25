#!/usr/bin/env bash
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

PORT="${PORT:-4002}"
HOST="${HOST:-127.0.0.1}"

if [ -f "$DIR/backend/venv/bin/uvicorn" ]; then
    exec "$DIR/backend/venv/bin/uvicorn" backend.app.main:app --host "$HOST" --port "$PORT"
else
    exec uvicorn backend.app.main:app --host "$HOST" --port "$PORT"
fi
