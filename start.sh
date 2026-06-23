#!/usr/bin/env bash
# Start the PolyBot control API (used by Replit and any plain host).
set -e
pip install -r polybot/requirements.txt
exec uvicorn polybot.api:app --host 0.0.0.0 --port "${PORT:-8080}"
