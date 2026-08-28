"""The compose files must keep dev-only services out of production, and keep them off the network.

Parsed as YAML rather than grepped, so a reformat cannot quietly pass these.

Why assert it at all: `docker-compose.prod.yml` is a STANDALONE file, not an overlay, which is
what makes "absent from prod" a real guarantee rather than a convention. That property is load-
bearing and invisible -- someone consolidating the two files into a base + overlay would break it
without noticing, and the first symptom would be a JupyterLab with an open handle to the
production database. This test is the tripwire for that.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

yaml = pytest.importorskip("yaml", reason="PyYAML not installed; compose shape unchecked")

ROOT = Path(__file__).resolve().parent.parent

#: Services that exist for development only. Adding one here is how you declare that intent.
DEV_ONLY = {"notebook", "test", "e2e", "e2e-app", "devbox", "ngrok"}

#: Dev services that publish a port. Every one of them must be loopback-bound -- see
#: `test_dev_only_published_ports_are_loopback_only` for why that is asserted and not trusted.
PORT_PUBLISHING_DEV_SERVICES = ("notebook", "devbox", "ngrok")


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


@pytest.mark.parametrize("name", PORT_PUBLISHING_DEV_SERVICES)
def test_dev_only_published_ports_are_loopback_only(name: str):
    """Same rule as the notebook, generalised, because `devbox` raises the stakes.

    `devbox` runs an SSH daemon and `ngrok` runs the agent that publishes it. Their remote path
    is the tunnel -- deliberately, so exactly one thing is internet-reachable and it is one we
    chose. A `0.0.0.0` mapping here would quietly add a second: an SSH port on every interface of
    this machine, reachable by anything on the LAN, with none of the host sshd's hardening
    applied to it. The local mappings exist only so the box can be checked from the host without
    involving ngrok.
    """
    dev = _load("docker-compose.yml")
    svc = dev["services"].get(name)
    if svc is None:
        pytest.skip(f"{name} not defined")
    for port in svc.get("ports", []):
        assert str(port).startswith("127.0.0.1:"), (
            f"{name} port {port!r} is not loopback-bound"
        )


def test_the_devbox_sshd_is_key_only():
    """The devbox is reachable from the public internet through the tunnel, so its sshd config is
    a security boundary rather than a convenience.

    Asserted rather than reviewed because the failure is silent: password auth left on still
    works for the operator, and nothing about a healthy container or a working tunnel would
    reveal that the box now accepts guesses from anyone who finds the endpoint.
    """
    conf = (ROOT / "deploy" / "devbox" / "sshd_config").read_text()
    directives = {}
    for line in conf.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, _, value = line.partition(" ")
        directives[key.lower()] = value.strip()

    assert directives.get("passwordauthentication") == "no", "devbox sshd accepts passwords"
    assert directives.get("permitrootlogin") == "no", "devbox sshd permits root login"
    assert directives.get("kbdinteractiveauthentication") == "no", (
        "devbox sshd allows keyboard-interactive auth, which is a password prompt by another name"
    )
    assert directives.get("permitemptypasswords") == "no", "devbox sshd permits empty passwords"
    assert directives.get("pubkeyauthentication") == "yes", (
        "devbox sshd has no pubkey auth -- with passwords off, nothing could log in"
    )
    assert directives.get("allowusers") == "dev", "devbox sshd is not restricted to the dev user"


def test_profiled_services_require_no_variable_the_default_stack_does_not():
    """A profiled service must not make an unrelated compose command fail.

    Compose interpolates the WHOLE file before it applies `--profile`, so a `${VAR:?...}` inside
    a profiled service is not scoped to that profile at all. That is how this was found: a
    required NGROK_AUTHTOKEN broke `--profile test`, which has nothing to do with tunnels.

    The rule is not "profiled services may not require variables" -- `analytics` and `narrative`
    legitimately require SEC_USER_AGENT. It is that they may not require anything the DEFAULT
    stack does not already require. SEC_USER_AGENT is mandatory for `api`, so demanding it costs
    nobody anything; an ngrok token is mandatory for nobody, so demanding it breaks everybody.
    """
    raw = (ROOT / "docker-compose.yml").read_text()
    dev = _load("docker-compose.yml")

    required = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*):\?")

    def required_vars(service: dict) -> set[str]:
        return set(required.findall(yaml.safe_dump(service)))

    default_stack = {
        name for name, svc in dev["services"].items() if not svc.get("profiles")
    }
    always_required: set[str] = set()
    for name in default_stack:
        always_required |= required_vars(dev["services"][name])

    for name, svc in dev["services"].items():
        if not svc.get("profiles"):
            continue
        extra = required_vars(svc) - always_required
        assert not extra, (
            f"profiled service {name!r} requires {sorted(extra)}, which the default stack "
            f"({sorted(default_stack)}) does not. Compose evaluates that even when the profile "
            "is not selected, so every other compose command fails for anyone who has not set "
            "it. Use ${VAR:-} and fail at run time instead."
        )

    assert "${SEC_USER_AGENT:?" in raw, (
        "api's SEC_USER_AGENT guard is gone -- the SEC blocks requests without a User-Agent, "
        "so failing at compose time is deliberate"
    )


def test_the_devbox_disables_per_source_penalties():
    """Per-source penalties must stay OFF, and that is not a relaxation.

    Every connection to the devbox arrives from ONE address -- the ngrok container on the compose
    network. The public client IP is never visible to sshd; the tunnel is the peer. So the input
    the penalty mechanism keys on carries no information, and attacker and operator share a
    source by construction.

    Leaving it on (the OpenSSH >= 9.8 default) is therefore a shared-fate lockout: a public TCP
    endpoint is scanned within minutes, each probe trips a penalty against that one address, and
    while one is active sshd refuses new connections instantly. The operator sees a bare
    "Connection closed by <edge ip>" naming neither reason nor source. Any stranger with a port
    scanner can lock them out for up to ten minutes at a time.

    Asserted because the fix looks exactly like something a later hardening pass would revert.
    """
    conf = (ROOT / "deploy" / "devbox" / "sshd_config").read_text()
    assert "\nPerSourcePenalties no" in "\n" + conf, (
        "devbox sshd has per-source penalties on. Every connection shares one source IP (the "
        "ngrok container), so scanners hitting the public endpoint will lock the operator out."
    )


def test_the_devbox_forwards_tcp():
    """`AllowTcpForwarding` is how the app is reached at all.

    The whole access model is one tunnel to SSH plus `ssh -L 8000:api:8000`, resolved from the
    container's side of the compose network. Turning this off as generic "hardening" would not
    look like a security change -- it would look like the API had gone down.
    """
    conf = (ROOT / "deploy" / "devbox" / "sshd_config").read_text()
    assert "\nAllowTcpForwarding yes" in "\n" + conf, (
        "devbox sshd does not allow TCP forwarding; `ssh -L 8000:api:8000` would fail"
    )


def test_the_notebook_mounts_the_database_read_only():
    """The API and the batches contend for one SQLite write lock. A notebook holding a write
    connection open between cells is a real hazard, so `:ro` makes it Docker's problem."""
    dev = _load("docker-compose.yml")
    mounts = [m for m in dev["services"]["notebook"]["volumes"] if "secfin-data" in str(m)]
    assert mounts, "notebook does not mount the data volume at all"
    for m in mounts:
        assert str(m).endswith(":ro"), f"data volume mounted writable: {m!r}"
