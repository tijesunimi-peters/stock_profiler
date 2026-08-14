"""Application settings, loaded from environment / .env."""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration.

    Values come from environment variables (or a local .env file). See .env.example.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Required by the SEC. Must identify the app and a contact email.
    # e.g. "sec-financials-api you@example.com"
    sec_user_agent: str = "sec-financials-api unset@example.com"

    # Local cache / DB path. SQLite for dev.
    secfin_db_path: str = "./data/secfin.db"

    # How long the in-memory ticker->CIK map (sec/ticker_cache.py) is considered fresh
    # before a lookup triggers a refetch of SEC's company_tickers.json. The SEC updates
    # that file rarely (new listings/delistings), so a long TTL is safe.
    secfin_ticker_cache_ttl_seconds: float = 86400.0

    # Where `storage/backup.py` writes snapshots and `storage/restore.py` reads them from.
    # Deliberately NOT under the same path as secfin_db_path -- see docker-compose.yml,
    # where this is bind-mounted to a host directory independent of the secfin-data
    # volume, so a backup survives even `docker compose down -v`.
    secfin_backup_dir: str = "./data/backups"

    # How many timestamped snapshots `storage/backup.py` keeps. Each snapshot is a full copy of
    # the DB (multi-GB at market scale), so without a cap the daily backup timer fills the disk --
    # this happened on prod 2026-07-21 (DEPLOYMENT_DO.md §6b). `secfin-latest.db` is a separate
    # pointer and is never counted or pruned. 0 disables pruning (keep everything -- old behavior).
    secfin_backup_retention: int = 7

    # SEC fair-access throttle. Do not raise above the SEC limit (verified 2026-07-03:
    # SEC's published guideline is 10 req/s per IP; 8 keeps a safety margin under it).
    sec_max_rps: int = 8

    # Per-IP burst limit (req/s) for the keyless public endpoints (statements, periods)
    # that api/routes.py's `public_router` serves -- see api/auth.py's
    # `limit_anonymous_traffic`. Stricter than the default "free" tier's per-key limit
    # (auth/tiers.py) since this protects an unauthenticated, unmetered surface.
    secfin_anon_rate_limit_per_sec: float = 2.0

    # Shared secret for admin-only endpoints (api/admin_routes.py), sent as the
    # `X-Admin-Secret` header. Empty by default -- admin_routes.py refuses every request
    # with 503 while this is unset, rather than silently exposing tier changes on an
    # empty-string-matches-empty-string comparison. Set a long random value before
    # deploying anywhere reachable.
    secfin_admin_secret: str = ""

    # Peer comparison & ranking (Metrics Phase 2, analytical/peer_ranks.py). Companies are
    # grouped by the first `sic_digits` of their SIC code; a group needs at least
    # `peer_min_size` companies with a comparable (non-N/A) value before a percentile/z-score
    # is emitted for that metric (below it, the metric shows "insufficient peers"). 2-digit /
    # min 5 chosen deliberately -- see docs/ROADMAP_METRICS.md Phase 2.
    secfin_peer_sic_digits: int = 2
    secfin_peer_min_size: int = 5

    # Sector insider flow (Sector Analytics v2 P6a, analytical/sector_insider_flow.py). Default
    # trailing-window length (days), anchored on transaction_date, for the per-SIC-group open-market
    # net buy/sell rollup. The batch's --window-days overrides it; the endpoint reports this default
    # in its window on a no-data (N/A) response.
    secfin_insider_flow_window_days: int = 90

    # Sector geographic mix (Sector Analytics v2 P6b, analytical/sector_geographic_mix.py). A
    # company enters the revenue-weighted rollup only if its ASC 280 geographic members sum to its
    # consolidated revenue within this relative tolerance -- otherwise its disclosure is treated as
    # inconsistent (mixed hierarchy levels; see docs/SPIKE_DIMENSIONAL.md) and it is EXCLUDED and
    # counted, never silently mis-summed. 1% by default.
    secfin_geo_mix_reconcile_tolerance: float = 0.01

    # How long a SQLite writer WAITS for another writer's lock before giving up (storage/
    # connection.py). WAL allows many readers with one writer; a second writer gets SQLITE_BUSY,
    # and Python's sqlite3 default of 5 seconds is far too short for this deployment -- the API,
    # the daily incremental ingest and the weekly analytics chains all write the same file.
    #
    # Found the expensive way (prod, 2026-08-14): `secfin-incremental.timer` fired at 06:02:13
    # while the peer-analytics chain was materializing metrics, and 20 seconds later
    # metrics_backfill died on "database is locked" -- discarding 76 minutes of work at 600 of
    # 9,055 companies. Nothing was corrupted and nothing was misconfigured; the loser of a lock
    # race simply was not told to wait.
    #
    # 120s is chosen against the LONGEST write transaction any job holds, not against a guess:
    # the incremental ingest commits per company, and the batch upserts commit per chunk. A
    # timeout is not a correctness fix -- two writers still serialize -- it is what turns a
    # collision into a pause instead of a crash.
    secfin_sqlite_busy_timeout_seconds: float = 120.0

    # Bulk backfill (src/secfin/ingest/backfill.py).
    secfin_bulk_data_dir: str = "./data/bulk"
    # 0 => auto-detect as max(1, cpu_count() - 1).
    secfin_backfill_workers: int = 0
    secfin_backfill_batch_size: int = 5000
    secfin_backfill_queue_maxsize: int = 50

    @property
    def user_agent_is_configured(self) -> bool:
        return "unset@example.com" not in self.sec_user_agent


settings = Settings()
