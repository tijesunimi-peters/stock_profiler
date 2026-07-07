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
    def frames_url(tag: str, period: str, unit: str = "USD", taxonomy: str = "us-gaap") -> str:
        """One GAAP tag across ALL filers for one SEC "frame" period.

        `period` is the SEC's own frame syntax, e.g. "CY2023" (annual duration),
        "CY2023Q4" (quarterly duration), or "CY2023Q4I" (quarter-end instant) -- see
        sec/frames.py's period builders. Confirmed live (2026-07-06): a bare annual
        instant ("CY2023I") 404s -- instant frames always need a quarter suffix.
        """
        return f"{DATA_HOST}/api/xbrl/frames/{taxonomy}/{tag}/{unit}/{period}.json"

    @staticmethod
    def company_tickers_url() -> str:
        return f"{WWW_HOST}/files/company_tickers.json"

    @staticmethod
    def filing_document_url(cik: int, accession: str, document: str) -> str:
        """Build the URL for one document inside a filing's EDGAR directory.

        Unlike the data.sec.gov JSON APIs, EDGAR's Archives layout uses the *un-padded*
        CIK and a dash-stripped accession number, e.g.
        /Archives/edgar/data/320193/000114036126025622/form4.xml
        """
        acc_nodash = accession.replace("-", "")
        return f"{WWW_HOST}/Archives/edgar/data/{int(cik)}/{acc_nodash}/{document}"

    @staticmethod
    def filing_index_json_url(cik: int, accession: str) -> str:
        """List every document in a filing's EDGAR directory.

        Needed when a filing's data document isn't the submissions.json `primaryDocument`
        (the rendered cover page) -- e.g. a 13F's information table, whose filename isn't
        standardized across filer software (confirmed against real Berkshire Hathaway
        13Fs: one quarter names it an arbitrary digit string, an older one names it
        "form13fInfoTable.xml").
        """
        acc_nodash = accession.replace("-", "")
        return f"{WWW_HOST}/Archives/edgar/data/{int(cik)}/{acc_nodash}/index.json"

    @staticmethod
    def strip_viewer_subdir(document: str) -> str:
        """Strip a viewer subdirectory (e.g. "xslF345X06/") off a primaryDocument path.

        submissions.json's `primaryDocument` for XML-native filings (ownership Forms
        3/4/5, 13F) points at EDGAR's *rendered-HTML* viewer path, not the raw XML --
        confirmed against a real Apple Form 4 (2026-07-04): fetching that exact path
        returns HTML. The raw XML sits at the filing's directory root under the same
        filename, with the viewer prefix stripped.
        """
        return document.rsplit("/", 1)[-1]
