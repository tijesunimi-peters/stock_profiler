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

    # SEC fair-access throttle. Do not raise above the SEC limit.
    sec_max_rps: int = 8

    @property
    def user_agent_is_configured(self) -> bool:
        return "unset@example.com" not in self.sec_user_agent


settings = Settings()
