"""Repository interface for the per-COMPANY open-market insider ratio (peer strip).

Distinct from `sector_insider_flow_repository.py`, and the difference is the whole point: that
one stores ONE aggregate per SIC group, which answers "is this sector buying?". The peer strip
needs every company's own value so each peer is a dot, which is a different row grain and cannot
be recovered from a group total.

Written only by `analytical/insider_peer_ratio.py` (a DuckDB batch), read by the serving endpoint
as plain point lookups -- no DuckDB on the request path (CLAUDE.md guardrail 6).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class InsiderPeerRatioRow:
    """One company's open-market insider posture over a trailing window.

    `net_ratio` is `(bought - sold) / (bought + sold)` in SHARES, bounded to [-1, +1]:
    +1 is a window of pure open-market buying, -1 pure selling, 0 balanced. Deliberately not
    `bought / sold` -- that ratio is unbounded, and undefined for the very common case of a
    company whose insiders sold and never bought, which is precisely the case a reader cares
    about. A bounded form keeps every one of those companies ON the strip instead of dropping
    them off the end of an axis.

    `bought`/`sold` are raw reported SHARE counts, never rescaled and never valued in dollars --
    a price is missing on many rows and a share count is what every P/S row carries.
    """

    cik: int
    peer_group: str
    as_of: str
    window_days: int
    window_start: str
    window_end: str
    bought: float
    sold: float
    net_ratio: float
    buy_count: int
    sell_count: int
    filer_count: int


class InsiderPeerRatioRepository(ABC):
    """Persists per-company open-market insider ratios for the peer strip."""

    @abstractmethod
    def bulk_upsert(self, rows: list[InsiderPeerRatioRow]) -> None:
        """Idempotently store a batch, keyed (cik, as_of, window_days)."""

    @abstractmethod
    def get_group(
        self, peer_group: str, as_of: str, window_days: int
    ) -> list[InsiderPeerRatioRow]:
        """Every company in one SIC group with a computable ratio for this window.

        Bounded by the group, so it stays a live indexed read. An empty list means no company in
        the group had open-market activity in the window -- which the endpoint must report as an
        absence it checked, never as a group of zeros.
        """

    @abstractmethod
    def latest_as_of(self, window_days: int) -> str | None:
        """The newest `as_of` computed for this window, or None if the batch never ran.

        Serving endpoints anchor on this rather than on today's date: the batch runs on a
        schedule, and asking for an `as_of` nobody computed would render an empty strip that
        looks identical to a sector with no insider activity.
        """

    @abstractmethod
    def prune_snapshots(self, window_days: int, keep: int) -> int:
        """Drop all but the newest `keep` `as_of` snapshots for this window. Returns rows deleted.

        Runs accumulate: each one writes a full set of company rows under a new `as_of`, and only
        the newest is ever served. A daily timer would therefore add ~3k rows a day forever to
        answer a question about one of them. Same reasoning as the backup job's `--keep`, and the
        same reason it is a floor rather than "delete everything older": keeping a few lets an
        operator see whether a run collapsed before it becomes the only copy.
        """

    @abstractmethod
    def close(self) -> None:
        """Release the underlying connection."""
