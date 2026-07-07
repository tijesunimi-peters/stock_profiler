"""Tests for the bulk-zip downloader's User-Agent guard (secfin.ingest.downloader).

Regression coverage for a real gap found during the pre-launch "User-Agent enforced
everywhere" audit: `download_resumable` doesn't go through SECClient (deliberately, see
its module docstring), so it never got SECClient's placeholder-User-Agent check for
free. Only the guard itself is tested here -- it must raise before any network call, so
no fake HTTP server is needed.
"""

from __future__ import annotations

import pytest

from secfin.ingest.downloader import download_resumable


def test_download_resumable_refuses_the_placeholder_user_agent(tmp_path):
    with pytest.raises(RuntimeError, match="SEC_USER_AGENT is not configured"):
        download_resumable(
            "https://example.com/whatever.zip",
            tmp_path / "whatever.zip",
            user_agent="sec-financials-api unset@example.com",
        )


def test_download_resumable_refuses_the_default_settings_user_agent(tmp_path, monkeypatch):
    monkeypatch.setattr(
        "secfin.ingest.downloader.settings.sec_user_agent",
        "sec-financials-api unset@example.com",
    )
    with pytest.raises(RuntimeError, match="SEC_USER_AGENT is not configured"):
        download_resumable("https://example.com/whatever.zip", tmp_path / "whatever.zip")


def test_download_resumable_accepts_a_real_user_agent_and_proceeds_to_the_network(
    tmp_path, monkeypatch
):
    """A configured User-Agent must clear the guard and reach the network call --
    verified by making the network call itself fail with something OTHER than the
    RuntimeError guard (a connection error to a reserved, unroutable address), proving
    the guard didn't block it.
    """
    with pytest.raises(Exception) as exc_info:
        download_resumable(
            "https://example.invalid/whatever.zip",
            tmp_path / "whatever.zip",
            user_agent="sec-financials-api you@example.com",
        )
    assert "SEC_USER_AGENT is not configured" not in str(exc_info.value)
