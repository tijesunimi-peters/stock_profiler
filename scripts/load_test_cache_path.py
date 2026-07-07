"""Load test the WARM cache-aside path (pre-launch checklist, docs/ROADMAP.md).

Exercises three already-warm caches through the real HTTP stack (not bypassing FastAPI
or the DB layer) -- public `/statements` (anon-rate-limited) and gated
`/insider-trades` / `/managers/{cik}/holdings` (per-key-rate-limited) -- to see whether
the fast path holds up under realistic concurrent subscriber load. The COLD path
(genuine SEC cache misses) is a separate, deliberately different test --
`scripts/load_test_cold_path.py` -- since a cold miss's bottleneck (live SEC fetch +
throttle) is a different concern from a warm hit's (SQLite read + FastAPI overhead).

Multiple free-tier keys, signed up via the real `POST /v1/signup` flow (no admin
secret), simulate multiple simultaneous subscribers on the gated endpoints -- the
per-key token-bucket limiter (auth/rate_limiter.py) gives each key an independent
budget, so a single key's own 5 req/s ceiling doesn't become the bottleneck instead of
the cache path's actual performance.

Assumes the target CIKs are ALREADY warm (this script doesn't seed them) -- run against
whatever's already cached in the running deployment; pass different CIKs/period via the
CLI flags if the defaults (Apple statements+insider, Berkshire 13F) aren't cached in
your environment.

Run (the `api` service must already be up): `docker compose run --rm api python
scripts/load_test_cache_path.py` (defaults to `http://api:8000`, the compose
service-name DNS reachable from another container on the same network).
"""

from __future__ import annotations

import argparse
import asyncio
import statistics
import time

import httpx

N_KEYS = 15
REQUESTS_PER_KEY = 8
ANON_REQUESTS = 6
ANON_INTERVAL_SECONDS = 0.5  # 2 req/s, matching the default anon ceiling


async def _signup(client: httpx.AsyncClient, email: str) -> str:
    resp = await client.post("/v1/signup", json={"email": email})
    resp.raise_for_status()
    return resp.json()["api_key"]


async def _timed_get(client: httpx.AsyncClient, url: str, headers: dict) -> tuple[float, int]:
    start = time.perf_counter()
    resp = await client.get(url, headers=headers)
    return time.perf_counter() - start, resp.status_code


async def _run_for_key(
    client: httpx.AsyncClient, api_key: str, url: str, n: int
) -> list[tuple[float, int]]:
    headers = {"X-API-Key": api_key}
    return [await _timed_get(client, url, headers) for _ in range(n)]


def _report(name: str, results: list[tuple[float, int]], elapsed: float | None = None) -> None:
    latencies = sorted(r[0] for r in results)
    statuses = [r[1] for r in results]
    ok = sum(1 for s in statuses if s == 200)
    p95_idx = min(len(latencies) - 1, int(len(latencies) * 0.95))
    print(f"{name}: {len(results)} requests, {ok} ok, {len(results) - ok} non-200")
    print(
        f"  latency: median={statistics.median(latencies) * 1000:.1f}ms "
        f"p95={latencies[p95_idx] * 1000:.1f}ms max={latencies[-1] * 1000:.1f}ms"
    )
    if elapsed is not None:
        print(f"  aggregate: {len(results)} requests in {elapsed:.2f}s = "
              f"{len(results) / elapsed:.1f} req/s")


async def _multi_key_load(client: httpx.AsyncClient, url: str, label: str) -> None:
    # Signup itself is anon-rate-limited (api/auth_routes.py's own `limit_anonymous_traffic`
    # dependency, same per-IP ceiling as the public Financials endpoints) -- sequential +
    # paced here, since key CREATION isn't the thing under test, only the traffic that
    # follows. Concurrent signups from one IP would just 429 against that ceiling.
    print(f"\nsigning up {N_KEYS} free-tier keys (simulating {N_KEYS} distinct subscribers)...")
    keys = []
    for i in range(N_KEYS):
        keys.append(await _signup(client, f"loadtest-{i}-{time.time()}@example.com"))
        await asyncio.sleep(ANON_INTERVAL_SECONDS)
    print(f"--- gated warm path: GET {url} ({N_KEYS} keys x {REQUESTS_PER_KEY} req) ---")
    start = time.perf_counter()
    per_key_results = await asyncio.gather(
        *[_run_for_key(client, k, url, REQUESTS_PER_KEY) for k in keys]
    )
    elapsed = time.perf_counter() - start
    all_results = [r for key_results in per_key_results for r in key_results]
    _report(label, all_results, elapsed)


async def _anon_paced_load(client: httpx.AsyncClient, url: str, label: str) -> None:
    print(f"\n--- public warm path: GET {url} (anon, paced at the anon ceiling) ---")
    results = []
    for _ in range(ANON_REQUESTS):
        results.append(await _timed_get(client, url, {}))
        await asyncio.sleep(ANON_INTERVAL_SECONDS)
    _report(label, results)


async def main(
    base_url: str, statements_cik: int, insider_cik: int, manager_cik: int, period: str
) -> None:
    async with httpx.AsyncClient(base_url=base_url, timeout=10.0) as client:
        await _anon_paced_load(
            client,
            f"/v1/companies/{statements_cik}/statements/income?year=2023",
            "statements (warm, anon, paced)",
        )
        await _multi_key_load(
            client,
            f"/v1/companies/{insider_cik}/insider-trades?limit=5",
            "insider-trades (warm, multi-key)",
        )
        await _multi_key_load(
            client,
            f"/v1/managers/{manager_cik}/holdings?period={period}",
            "manager holdings (warm, multi-key)",
        )


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--base-url", default="http://api:8000")
    p.add_argument("--statements-cik", type=int, default=320193)  # Apple
    p.add_argument("--insider-cik", type=int, default=320193)  # Apple
    p.add_argument("--manager-cik", type=int, default=1067983)  # Berkshire Hathaway
    p.add_argument("--period", default="2026-03-31")
    args = p.parse_args()
    asyncio.run(
        main(
            args.base_url,
            args.statements_cik,
            args.insider_cik,
            args.manager_cik,
            args.period,
        )
    )
