"""Post-deploy verification: end-to-end checks against a running secfin instance,
runnable from OUTSIDE the host (only needs network access to --base-url).

This is the automated version of docs/product/LAUNCH_READINESS.md §2's "verify the
deployed instance end-to-end: signup -> key -> gated request -> 429 behavior, from
outside the host" -- see docs/DEPLOYMENT.md §11 for how it fits into the runbook.

Checks, in order:
  1. GET  /health                                              -> 200 {"status": "ok"}
  2. POST /v1/signup                                            -> 200, issues a fresh
     free-tier API key (a throwaway, randomized email -- safe to run repeatedly)
  3. GET  /v1/companies/{symbol}/beneficial-ownership (gated)   -> 200 with the
     expected response shape, using the just-issued key
  4. GET  /v1/companies/{unknown}/statements/income (public)    -> 404 unknown ticker
  5. A rapid burst of requests on the fresh key against a cheap gated endpoint
     (/v1/usage) -> at least one 429 (free tier is 5 req/s -- auth/tiers.py)
  6. GET  /docs                                                 -> 200 (Swagger UI)
  7. GET  /, /explorer, /guide, /coverage                       -> 200 (static pages)

Exit code 0 if every check passes, 1 otherwise. Prints one PASS/FAIL line per check so
a human (or a cron/CI wrapper) can scan it quickly.

Safe to run repeatedly against a real deployment: each run signs up exactly one fresh
throwaway key, makes a small, bounded number of requests, and the rate-limit check
targets a DB-only endpoint (/v1/usage) rather than repeatedly hitting the SEC-backed
one -- this script does not itself pressure the SEC fair-access ceiling.

Run locally, against `docker compose up api` (see docs/product/tracks/infra.md for a
verified example run):
    python3 scripts/verify_deployment.py --base-url http://localhost:8000
  or, from inside the compose network:
    docker compose run --rm api python scripts/verify_deployment.py --base-url http://api:8000
  (needs `httpx`, already a production dependency -- the prod image has it; running
  from a bare host needs `pip install httpx` first.)

Run against a real deployed host once one exists (the actual convergence-phase gate):
    python3 scripts/verify_deployment.py --base-url https://api.yourdomain.com
"""

from __future__ import annotations

import argparse
import sys
import uuid

import httpx

UNKNOWN_TICKER = "ZZZZNOTATICKER"
GATED_CHECK_SYMBOL = "AAPL"
STATIC_PAGES = ["/", "/explorer", "/guide", "/coverage"]


class Result:
    def __init__(self, name: str) -> None:
        self.name = name
        self.ok = False
        self.detail = ""

    def passed(self, detail: str = "") -> "Result":
        self.ok = True
        self.detail = detail
        return self

    def failed(self, detail: str) -> "Result":
        self.ok = False
        self.detail = detail
        return self

    def report(self) -> None:
        status = "PASS" if self.ok else "FAIL"
        line = f"[{status}] {self.name}"
        if self.detail:
            line += f" -- {self.detail}"
        print(line)


def check_health(client: httpx.Client) -> Result:
    r = Result("GET /health")
    try:
        resp = client.get("/health")
    except httpx.HTTPError as e:
        return r.failed(f"request error: {e}")
    if resp.status_code == 200 and resp.json().get("status") == "ok":
        return r.passed(f"status={resp.status_code}")
    return r.failed(f"status={resp.status_code} body={resp.text[:200]!r}")


def check_signup(client: httpx.Client) -> tuple[Result, str | None]:
    r = Result("POST /v1/signup")
    email = f"verify-deploy-{uuid.uuid4().hex[:12]}@example.com"
    try:
        resp = client.post("/v1/signup", json={"email": email})
    except httpx.HTTPError as e:
        return r.failed(f"request error: {e}"), None
    if resp.status_code != 200:
        return r.failed(f"status={resp.status_code} body={resp.text[:200]!r}"), None
    body = resp.json()
    key = body.get("api_key")
    if not key:
        return r.failed(f"no api_key in response body: {body}"), None
    detail = f"tier={body.get('tier')} rate_limit_per_sec={body.get('rate_limit_per_sec')}"
    return r.passed(detail), key


def check_gated_endpoint(client: httpx.Client, api_key: str, symbol: str) -> Result:
    r = Result(f"GET /v1/companies/{symbol}/beneficial-ownership (gated, X-API-Key)")
    try:
        resp = client.get(
            f"/v1/companies/{symbol}/beneficial-ownership",
            headers={"X-API-Key": api_key},
        )
    except httpx.HTTPError as e:
        return r.failed(f"request error: {e}")
    if resp.status_code != 200:
        return r.failed(f"status={resp.status_code} body={resp.text[:200]!r}")
    body = resp.json()
    if "cik" not in body or "caveats" not in body or "beneficial_ownership" not in body:
        return r.failed(f"unexpected response shape: {sorted(body.keys())}")
    n = len(body["beneficial_ownership"])
    return r.passed(
        f"cik={body['cik']} rows={n} "
        "(0 rows can be a real coverage-window gap, not itself a failure -- see "
        "docs/DATA_MODEL.md's Coverage boundaries)"
    )


def check_unknown_ticker_404(client: httpx.Client) -> Result:
    r = Result(f"GET /v1/companies/{UNKNOWN_TICKER}/statements/income (unknown ticker)")
    try:
        # `year` is a required query param on this endpoint (api/routes.py:get_statement)
        # -- omitting it 422s before the handler ever resolves the ticker, which would
        # test FastAPI's own validation instead of the ticker-lookup 404 this check
        # wants. 2024 is arbitrary; the ticker is unknown regardless of year.
        resp = client.get(f"/v1/companies/{UNKNOWN_TICKER}/statements/income", params={"year": 2024})
    except httpx.HTTPError as e:
        return r.failed(f"request error: {e}")
    if resp.status_code == 404:
        detail = str(resp.json().get("detail", ""))[:80]
        return r.passed(f"detail={detail!r}")
    return r.failed(f"expected 404, got {resp.status_code} body={resp.text[:200]!r}")


def check_rate_limit_429(client: httpx.Client, api_key: str, burst: int) -> Result:
    r = Result(f"Free-tier rate limit: burst of {burst} req on /v1/usage, one key")
    statuses: list[int] = []
    try:
        for _ in range(burst):
            resp = client.get("/v1/usage", headers={"X-API-Key": api_key})
            statuses.append(resp.status_code)
    except httpx.HTTPError as e:
        return r.failed(f"request error after {len(statuses)} requests: {e}")
    if 429 in statuses:
        return r.passed(f"statuses={statuses}")
    return r.failed(f"no 429 seen in {burst} rapid requests -- statuses={statuses}")


def check_docs(client: httpx.Client) -> Result:
    r = Result("GET /docs")
    try:
        resp = client.get("/docs")
    except httpx.HTTPError as e:
        return r.failed(f"request error: {e}")
    if resp.status_code == 200:
        return r.passed()
    return r.failed(f"status={resp.status_code}")


def check_static_pages(client: httpx.Client) -> list[Result]:
    results = []
    for path in STATIC_PAGES:
        r = Result(f"GET {path}")
        try:
            resp = client.get(path)
        except httpx.HTTPError as e:
            results.append(r.failed(f"request error: {e}"))
            continue
        if resp.status_code == 200:
            results.append(r.passed())
        else:
            results.append(r.failed(f"status={resp.status_code}"))
    return results


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument(
        "--base-url",
        default="http://localhost:8000",
        help="Deployed instance to check, e.g. https://api.yourdomain.com "
        "(default: http://localhost:8000, for a locally running `docker compose up api`)",
    )
    p.add_argument("--timeout", type=float, default=30.0, help="Per-request timeout in seconds")
    p.add_argument(
        "--burst",
        type=int,
        default=15,
        help="Requests fired rapidly to trip the free tier's 5 req/s limit (default 15)",
    )
    p.add_argument(
        "--symbol",
        default=GATED_CHECK_SYMBOL,
        help=f"Ticker used for the gated-endpoint and unknown-ticker checks (default {GATED_CHECK_SYMBOL})",
    )
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_arg_parser().parse_args(argv)

    results: list[Result] = []
    with httpx.Client(base_url=args.base_url, timeout=args.timeout) as client:
        results.append(check_health(client))

        signup_result, api_key = check_signup(client)
        results.append(signup_result)

        if api_key:
            results.append(check_gated_endpoint(client, api_key, args.symbol))
            results.append(check_rate_limit_429(client, api_key, burst=args.burst))
        else:
            print("  (skipping gated-endpoint and rate-limit checks -- signup failed)")

        results.append(check_unknown_ticker_404(client))
        results.append(check_docs(client))
        results.extend(check_static_pages(client))

    print()
    for r in results:
        r.report()

    n_fail = sum(1 for r in results if not r.ok)
    print()
    print(f"{len(results) - n_fail}/{len(results)} checks passed")
    return 1 if n_fail else 0


if __name__ == "__main__":
    sys.exit(main())
