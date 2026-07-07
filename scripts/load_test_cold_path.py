"""Load test the COLD cache path (pre-launch checklist, docs/ROADMAP.md) -- concurrent
genuine cache misses approaching the SEC fair-access throttle ceiling.

Distinct from scripts/load_test_cache_path.py (warm hits): a cold miss's bottleneck is
the live SEC fetch + the shared process-wide rate limiter (sec/client.py's
`_shared_default_limiter` -- see its docstring for the concurrency bug this fixed), not
SQLite/FastAPI overhead. This script verifies that fix empirically: N concurrent cache
misses (real, previously-never-ingested CIKs) must NOT let SEC request volume exceed
`sec_max_rps` in aggregate, even though they arrive at the API concurrently -- the
requests should queue and pace through the single shared limiter, not fire all at once.

Run (the `api` service must already be up, target CIKs must be genuinely uncached --
confirm first, e.g. via `SELECT DISTINCT cik FROM raw_facts`): `docker compose run --rm
api python scripts/load_test_cold_path.py --ciks 937966,1089113,1114448,...`
"""

from __future__ import annotations

import argparse
import asyncio
import time

import httpx


async def _signup(client: httpx.AsyncClient, email: str) -> str:
    resp = await client.post("/v1/signup", json={"email": email})
    resp.raise_for_status()
    return resp.json()["api_key"]


async def _timed_get(client: httpx.AsyncClient, cik: int, api_key: str) -> tuple[int, float, int]:
    start = time.perf_counter()
    resp = await client.get(
        f"/v1/companies/{cik}/insider-trades?limit=5", headers={"X-API-Key": api_key}
    )
    return cik, time.perf_counter() - start, resp.status_code


async def main(base_url: str, ciks: list[int], max_rps: int) -> None:
    async with httpx.AsyncClient(base_url=base_url, timeout=60.0) as client:
        # One key PER CIK (each only makes ONE request), signed up sequentially/paced
        # (signup itself is anon-rate-limited) -- this is deliberately NOT the thing
        # under test. It exists purely so the app's own per-key anti-abuse limiter (5
        # req/s per free-tier key) can't reject this burst before it ever reaches the
        # shared SEC-facing limiter this script actually wants to exercise. Each key
        # uses only 1 of its own 5 allowed req/s, so none of them get app-level 429s.
        print(f"signing up {len(ciks)} keys (1 request each -- avoids the per-key limiter)...")
        keys = []
        for i in range(len(ciks)):
            keys.append(await _signup(client, f"coldtest-{i}-{time.time()}@example.com"))
            await asyncio.sleep(0.5)  # respect signup's own anon ceiling (2 req/s)

        print(f"\nfiring {len(ciks)} CONCURRENT genuine cache misses (never-ingested CIKs)...")
        start = time.perf_counter()
        results = await asyncio.gather(
            *[_timed_get(client, cik, key) for cik, key in zip(ciks, keys, strict=True)]
        )
        elapsed = time.perf_counter() - start

        min_expected_seconds = (len(ciks) - 1) / max_rps
        print(f"\nelapsed: {elapsed:.2f}s for {len(ciks)} concurrent cold misses")
        print(
            f"expected minimum if properly throttled at {max_rps} req/s: "
            f"~{min_expected_seconds:.2f}s"
        )
        if elapsed >= min_expected_seconds * 0.8:  # generous margin for scheduling jitter
            print("-> PASS: aggregate request rate stayed within the throttle ceiling.")
        else:
            print(
                "-> FAIL: completed faster than the configured throttle should allow -- "
                "the shared rate limiter may not be working."
            )

        for cik, latency, status in sorted(results, key=lambda r: r[1]):
            print(f"  cik={cik} status={status} latency={latency * 1000:.0f}ms")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--base-url", default="http://api:8000")
    p.add_argument("--ciks", required=True, help="Comma-separated, genuinely uncached CIKs")
    p.add_argument("--max-rps", type=int, default=8, help="Configured sec_max_rps")
    args = p.parse_args()
    asyncio.run(main(args.base_url, [int(c) for c in args.ciks.split(",")], args.max_rps))
