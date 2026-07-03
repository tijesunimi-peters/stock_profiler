"""Rate-limited HTTP client for the SEC's public data APIs.

Responsibilities (and *only* these — no business logic here):
  * attach a descriptive User-Agent to every request (required by the SEC)
  * throttle to stay within the SEC fair-access rate limit
  * fetch JSON and raw bytes

Verify current SEC fair-access terms before launch; treat the throttle value as
"confirm, don't assume".
"""

from __future__ import annotations

import asyncio
import time

import httpx

from secfin.config import settings

DATA_HOST = "https://data.sec.gov"
WWW_HOST = "https://www.sec.gov"


class RateLimiter:
    """Simple async token-ish limiter: spaces requests at least `min_interval` apart."""

    def __init__(self, max_rps: int) -> None:
        self.min_interval = 1.0 / max(1, max_rps)
        self._lock = asyncio.Lock()
        self._last = 0.0

    async def wait(self) -> None:
        async with self._lock:
            now = time.monotonic()
            delay = self._last + self.min_interval - now
            if delay > 0:
                await asyncio.sleep(delay)
            self._last = time.monotonic()


class SECClient:
    """Thin async wrapper over the SEC APIs."""

    def __init__(self, user_agent: str | None = None, max_rps: int | None = None) -> None:
        ua = user_agent or settings.sec_user_agent
        if "unset@example.com" in ua:
            raise RuntimeError(
                "SEC_USER_AGENT is not configured. The SEC blocks requests without a "
                "descriptive User-Agent. Set it in .env (see .env.example)."
            )
        self._limiter = RateLimiter(max_rps or settings.sec_max_rps)
        self._client = httpx.AsyncClient(
            headers={"User-Agent": ua, "Accept-Encoding": "gzip, deflate"},
            timeout=30.0,
        )

    async def __aenter__(self) -> SECClient:
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        await self._client.aclose()

    async def get_json(self, url: str) -> dict:
        await self._limiter.wait()
        resp = await self._client.get(url)
        resp.raise_for_status()
        return resp.json()

    async def get_bytes(self, url: str) -> bytes:
        await self._limiter.wait()
        resp = await self._client.get(url)
        resp.raise_for_status()
        return resp.content

    # --- convenience URL builders -------------------------------------------------

    @staticmethod
    def cik10(cik: int) -> str:
        """SEC URLs expect a 10-digit zero-padded CIK."""
        return f"{int(cik):010d}"

    def submissions_url(self, cik: int) -> str:
        return f"{DATA_HOST}/submissions/CIK{self.cik10(cik)}.json"

    def company_facts_url(self, cik: int) -> str:
        return f"{DATA_HOST}/api/xbrl/companyfacts/CIK{self.cik10(cik)}.json"

    def company_concept_url(self, cik: int, concept: str, taxonomy: str = "us-gaap") -> str:
        return (
            f"{DATA_HOST}/api/xbrl/companyconcept/"
            f"CIK{self.cik10(cik)}/{taxonomy}/{concept}.json"
        )

    @staticmethod
    def company_tickers_url() -> str:
        return f"{WWW_HOST}/files/company_tickers.json"
