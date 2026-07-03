"""FastAPI application entrypoint.

Run locally:
    uvicorn secfin.api.main:app --reload
Docs at /docs.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from secfin.api.routes import router

STATIC_DIR = Path(__file__).parent / "static"

app = FastAPI(
    title="sec-financials-api",
    version="0.1.0",
    description="Normalized SEC financial data (Track 1: structured numeric data).",
)

app.include_router(router, prefix="/v1")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", include_in_schema=False)
async def landing_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/explorer", include_in_schema=False)
async def data_explorer() -> FileResponse:
    return FileResponse(STATIC_DIR / "explorer.html")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
