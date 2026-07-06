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

    # SEC fair-access throttle. Do not raise above the SEC limit (verified 2026-07-03:
    # SEC's published guideline is 10 req/s per IP; 8 keeps a safety margin under it).
    sec_max_rps: int = 8

    # Per-IP burst limit (req/s) for the keyless public endpoints (statements, periods)
    # that api/routes.py's `public_router` serves -- see api/auth.py's
    # `limit_anonymous_traffic`. Stricter than the default "free" tier's per-key limit
    # (auth/tiers.py) since this protects an unauthenticated, unmetered surface.
    secfin_anon_rate_limit_per_sec: float = 2.0

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
