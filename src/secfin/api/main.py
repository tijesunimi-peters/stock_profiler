"""FastAPI application entrypoint.

Run locally:
    uvicorn secfin.api.main:app --reload
Docs at /docs.
"""

from __future__ import annotations

from fastapi import FastAPI

from secfin.api.routes import router

app = FastAPI(
    title="sec-financials-api",
    version="0.1.0",
    description="Normalized SEC financial data (Track 1: structured numeric data).",
)

app.include_router(router, prefix="/v1")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
