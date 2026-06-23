# PolyBot control API — for Docker-based hosts (Fly.io, Railway, Render Docker, a VPS).
FROM python:3.11-slim

WORKDIR /app

COPY polybot/requirements.txt polybot/requirements.txt
RUN pip install --no-cache-dir -r polybot/requirements.txt

COPY polybot polybot

ENV PORT=8000
EXPOSE 8000

# Honour the host-provided $PORT (Render/Railway/Fly inject it).
CMD ["sh", "-c", "uvicorn polybot.api:app --host 0.0.0.0 --port ${PORT:-8000}"]
