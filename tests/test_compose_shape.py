"""The compose files must keep dev-only services out of production, and keep them off the network.

Parsed as YAML rather than grepped, so a reformat cannot quietly pass these.

Why assert it at all: `docker-compose.prod.yml` is a STANDALONE file, not an overlay, which is
what makes "absent from prod" a real guarantee rather than a convention. That property is load-
bearing and invisible -- someone consolidating the two files into a base + overlay would break it
without noticing, and the first symptom would be a JupyterLab with an open handle to the
production database. This test is the tripwire for that.
"""

from __future__ import annotations

from pathlib import Path

import pytest

yaml = pytest.importorskip("yaml", reason="PyYAML not installed; compose shape unchecked")

ROOT = Path(__file__).resolve().parent.parent

#: Services that exist for development only. Adding one here is how you declare that intent.
DEV_ONLY = {"notebook", "test", "e2e", "e2e-app"}


def _load(name: str) -> dict:
    return yaml.safe_load((ROOT / name).read_text())


def test_dev_only_services_are_absent_from_the_production_compose_file():
    prod = _load("docker-compose.prod.yml")
    leaked = DEV_ONLY & set(prod.get("services", {}))
    assert not leaked, (
        f"{sorted(leaked)} reached docker-compose.prod.yml. These are dev-only; production must "
        "not be able to start them at all."
    )


def test_the_production_file_is_standalone_not_an_overlay():
    """The guarantee above only holds while prod is a complete file in its own right.

    If it ever became an overlay applied on top of docker-compose.yml, every dev-only service
    would come with it -- and compose merges list-valued keys by CONCATENATION, so the dev file's
    `0.0.0.0:8000` port binding would survive alongside prod's loopback-only one. The file's own
    header explains this; the test stops it being undone silently.
    """
    prod = _load("docker-compose.prod.yml")
    assert "api" in prod.get("services", {}), "prod must define `api` itself, not inherit it"
    assert "caddy" in prod.get("services", {}), "prod must define `caddy` itself"
    for name, svc in prod["services"].items():
        assert "extends" not in svc, f"{name} extends another file — prod must stay standalone"


def test_every_dev_only_service_is_behind_a_profile():
    """A profile is what stops `docker compose up` starting these by accident."""
    dev = _load("docker-compose.yml")
    for name in DEV_ONLY:
        svc = dev["services"].get(name)
        if svc is None:
            continue
        assert svc.get("profiles"), f"{name} has no `profiles:` — a bare `up` would start it"


def test_the_notebook_binds_loopback_only():
    """It has no auth beyond Jupyter's token and holds a handle to a multi-GB database. Even on a
    developer machine it has no business being reachable from the network."""
    dev = _load("docker-compose.yml")
    for port in dev["services"]["notebook"].get("ports", []):
        assert str(port).startswith("127.0.0.1:"), (
            f"notebook port {port!r} is not loopback-bound"
        )


def test_the_notebook_mounts_the_database_read_only():
    """The API and the batches contend for one SQLite write lock. A notebook holding a write
    connection open between cells is a real hazard, so `:ro` makes it Docker's problem."""
    dev = _load("docker-compose.yml")
    mounts = [m for m in dev["services"]["notebook"]["volumes"] if "secfin-data" in str(m)]
    assert mounts, "notebook does not mount the data volume at all"
    for m in mounts:
        assert str(m).endswith(":ro"), f"data volume mounted writable: {m!r}"
