"""CUSIP -> issuer CIK resolution for 13F holdings.

`InstitutionalHolding.cik` is left None by sec/institutional.py's parser -- 13F
information tables report CUSIP, not CIK, and the SEC has no free bulk CUSIP->CIK
endpoint (see storage/cusip_repository.py). This module resolves CUSIPs opportunistically
by matching a 13F row's `nameOfIssuer` against SEC's own company_tickers.json (the same
source sec/ticker_cache.py uses for ticker->CIK), and persists both hits and misses via
a CusipMapRepository.

Deliberately conservative: only an EXACT match after normalization counts as resolved.
No fuzzy/similarity matching. A wrong CIK silently attached to a position is worse than
an honestly-unresolved one for data we intend to serve as fact -- confirmed by a real
case this conservatism correctly declines: a 2026 Berkshire 13F reports CUSIP 02005N100
as issuer "ALLY FINL INC", but SEC's registered title is "Ally Financial Inc." --
normalizing both ("ALLY FINL" vs "ALLY FINANCIAL") does not produce a match, because
"FINL" is an abbreviation this module does not expand. That CUSIP stays unresolved
rather than guessed at; see tests/test_cusip.py.
"""

from __future__ import annotations

import asyncio
import re
import time

from secfin.normalize.schema import CusipResolutionStats, HoldingsSnapshot
from secfin.sec.client import SECClient
from secfin.storage.cusip_repository import CusipMapRepository

# Common legal-entity suffixes seen in SEC company_tickers.json titles and 13F
# nameOfIssuer fields alike. Deliberately a starter set, not exhaustive -- extend as
# real mismatches turn up (same growth pattern as normalize/mapping.py's candidate tags).
_LEGAL_SUFFIXES = {
    "INC",
    "INCORPORATED",
    "CORP",
    "CORPORATION",
    "CO",
    "COMPANY",
    "LTD",
    "LIMITED",
    "LLC",
    "LP",
    "PLC",
    "HOLDINGS",
    "HLDGS",
    "GROUP",
    "SA",
    "AG",
    "NV",
}

_PUNCTUATION_RE = re.compile(r"[^\w\s]")


def normalize_issuer_name(name: str) -> str:
    """Uppercase, strip punctuation, and drop common legal suffixes for name matching.

    Pure and deliberately simple: this is an exact-match key, not a fuzzy one. It does
    NOT expand abbreviations (e.g. "FINL" -> "FINANCIAL") -- see the module docstring's
    ALLY FINANCIAL example for why that's a feature, not a gap to close casually.
    """
    cleaned = _PUNCTUATION_RE.sub("", name.upper())
    words = [w for w in cleaned.split() if w not in _LEGAL_SUFFIXES]
    return " ".join(words)


def parse_company_name_index(payload: dict) -> dict[str, int]:
    """SEC's company_tickers.json -> {normalized company name: cik}.

    Pure, so it's testable without network (same intent as sec/ticker_cache.py's
    parse_ticker_map, over the same payload shape). First CIK seen for a given
    normalized name wins if two titles collide after normalization.
    """
    out: dict[str, int] = {}
    for row in payload.values():
        title = row.get("title")
        cik = row.get("cik_str")
        if not title or cik is None:
            continue
        key = normalize_issuer_name(title)
        if key:
            out.setdefault(key, int(cik))
    return out


class CusipResolver:
    """Resolves 13F CUSIPs to issuer CIKs, caching the SEC name index in memory (same
    TTL-refresh shape as sec/ticker_cache.py.TickerCache) and persisting outcomes via a
    CusipMapRepository so the same CUSIP is a cache hit across every manager's 13F.
    """

    def __init__(self, repo: CusipMapRepository, ttl_seconds: float) -> None:
        self._repo = repo
        self._ttl = ttl_seconds
        self._name_index: dict[str, int] = {}
        self._loaded_at: float | None = None
        self._lock = asyncio.Lock()

    def _is_fresh(self) -> bool:
        return self._loaded_at is not None and (time.monotonic() - self._loaded_at) < self._ttl

    async def _ensure_fresh(self, client: SECClient) -> None:
        if self._is_fresh():
            return
        async with self._lock:
            if self._is_fresh():  # another task may have refreshed while we waited
                return
            payload = await client.get_json(client.company_tickers_url())
            self._name_index = parse_company_name_index(payload)
            self._loaded_at = time.monotonic()

    async def resolve(self, client: SECClient, cusip: str, issuer_name: str) -> int | None:
        """Resolve one CUSIP, recording the outcome (resolved or unresolved) in the repo.

        A CUSIP already resolved in the repo is returned immediately -- no name-index
        fetch, no re-matching.
        """
        cached = self._repo.get_cik(cusip)
        if cached is not None:
            return cached

        await self._ensure_fresh(client)
        cik = self._name_index.get(normalize_issuer_name(issuer_name))
        if cik is not None:
            self._repo.record_resolved(cusip, cik, issuer_name)
        else:
            self._repo.record_unresolved(cusip, issuer_name)
        return cik


def cusip_resolution_stats(repo: CusipMapRepository) -> CusipResolutionStats:
    """Coverage snapshot for the M2.5 "track CUSIP resolution rate" roadmap item.

    Pure over the repository's counts (no network) -- `total == 0` (nothing attempted
    yet, e.g. a fresh DB) reports `resolution_rate=None` rather than a misleading 0%%.
    See CusipResolutionStats' docstring for why this number is expected to drift
    upward over time rather than being a fixed ceiling.
    """
    resolved, unresolved = repo.resolution_counts()
    total = resolved + unresolved
    return CusipResolutionStats(
        resolved=resolved,
        unresolved=unresolved,
        total=total,
        resolution_rate=(resolved / total) if total else None,
    )


async def resolve_snapshot_cusips(
    client: SECClient, resolver: CusipResolver, snapshot: HoldingsSnapshot
) -> None:
    """Populate InstitutionalHolding.cik in place for every holding the resolver matches.

    Mutates `snapshot.holdings` -- callers that need to keep the unresolved values should
    resolve a copy. Skips rows with no issuer_name (nothing to match against); leaves
    `cik` as None wherever the resolver can't find an exact match, same as `resolve`.
    """
    for holding in snapshot.holdings:
        if holding.issuer_name:
            holding.cik = await resolver.resolve(client, holding.cusip, holding.issuer_name)
