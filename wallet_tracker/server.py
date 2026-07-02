"""FastAPI backend for the wallet balance + PnL tracker.

Serves the PWA at `/` and one JSON endpoint:

    GET /api/report?address=0x...&minutes=120
    GET /api/report?address=0x...&preset=2h

Run locally (where outbound network to Polymarket / Polygon is open):

    pip install -r wallet_tracker/requirements.txt
    uvicorn wallet_tracker.server:app --reload     # http://127.0.0.1:8000

This module is self-contained — it imports only from within `wallet_tracker`.
"""

from __future__ import annotations

import pathlib
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .report import PRESETS, build_report

_WEBUI = pathlib.Path(__file__).parent / "webui"


def create_app() -> FastAPI:
    app = FastAPI(title="Polymarket Wallet Tracker", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/report")
    def report(
        address: str = Query(..., description="آدرس کیف پول روی Polygon (0x...)"),
        minutes: Optional[float] = Query(None, gt=0, description="طول بازه به دقیقه"),
        preset: Optional[str] = Query(None, description="یکی از: " + ", ".join(PRESETS)),
    ):
        if minutes is None:
            minutes = PRESETS.get((preset or "1h").lower())
            if minutes is None:
                raise HTTPException(400, f"preset نامعتبر. یکی از این‌ها: {', '.join(PRESETS)}")
        try:
            return build_report(address, float(minutes))
        except ValueError as exc:
            raise HTTPException(400, str(exc))

    @app.get("/api/health")
    def health():
        return {"ok": True, "presets": PRESETS}

    # -- PWA static hosting ------------------------------------------------ #
    if _WEBUI.exists():
        @app.get("/")
        def index():
            return FileResponse(_WEBUI / "index.html")

        app.mount("/", StaticFiles(directory=str(_WEBUI)), name="webui")
    else:  # pragma: no cover
        @app.get("/")
        def index_missing():
            return JSONResponse({"error": "webui not found", "api": "/api/report"})

    return app


app = create_app()
