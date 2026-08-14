#!/usr/bin/env bash
# Weekly peer-analytics refresh, run on the VPS via secfin-peer-analytics.timer.
# See docs/DEPLOYMENT_DO.md.
#
# THE ORDER IS THE POINT. Each step reads what the previous one wrote:
#
#   metrics_backfill   raw_facts            -> metric_values
#   peer_distribution  metric_values        -> metric_distributions
#   peer_ranks         metric_values        -> metric_ranks
#
# Running them as three independent timers would let a distribution be computed from a
# half-written metric_values, so they are one sequential script and a failure stops the chain
# rather than publishing ranks that disagree with the values under them.
#
# ⚠️ This is the pipeline whose STALENESS caused the 2026-08-12 incident: metric_values had been
# materialized before the whole-market companyfacts backfill landed the granular concepts, so
# only 2 companies in Apple's 231-company SIC group had a current ratio and 23 of 30 metrics had
# no peer distribution at all. Nothing was broken -- it was simply never re-run. Hence a timer.
#
# Runs on the `analytics` image (adds duckdb, which the serving image deliberately lacks).
set -uo pipefail

APP_DIR="${SECFIN_APP_DIR:-/opt/secfin}"
LOG_DIR="${SECFIN_LOG_DIR:-/var/log/secfin}"
STATUS_FILE="$LOG_DIR/peer-analytics.status"
COMPOSE_FILE="${SECFIN_COMPOSE_FILE:-docker-compose.prod.yml}"

mkdir -p "$LOG_DIR"

if ! cd "$APP_DIR"; then
    echo "$(date -u +%FT%TZ) FAIL cannot cd to $APP_DIR" >>"$STATUS_FILE"
    exit 1
fi

if ! docker compose -f "$COMPOSE_FILE" --profile analytics build analytics; then
    echo "$(date -u +%FT%TZ) FAIL could not build the analytics image" >>"$STATUS_FILE"
    exit 1
fi

run_step() {
    local name="$1"; shift
    # Capture into a PRE-DECLARED variable. `local code=$?` would record the exit status of the
    # `local` builtin itself -- always 0 -- so every step reported success, the chain ran on past
    # a failure, and the script exited 0. Caught by driving this with a stub docker that fails
    # one step: it logged "FAIL peer_distribution exited 0" and then ran peer_ranks anyway.
    local code
    code=0
    docker compose -f "$COMPOSE_FILE" --profile analytics run --rm analytics "$@" || code=$?
    if [ "$code" -eq 0 ]; then
        echo "$(date -u +%FT%TZ) OK   $name" >>"$STATUS_FILE"
        return 0
    fi
    echo "$(date -u +%FT%TZ) FAIL $name exited $code -- chain stopped" >>"$STATUS_FILE"
    return "$code"
}

# ~5.4 hours over ~17k companies. `--start-after` exists for resuming an interrupted run by
# hand; a weekly timer simply redoes it, which is cheaper than tracking a frontier across runs.
run_step "metrics_backfill"  python -m secfin.ingest.metrics_backfill   || exit $?
run_step "peer_distribution" python -m secfin.analytical.peer_distribution || exit $?
run_step "peer_ranks"        python -m secfin.analytical.peer_ranks     || exit $?

echo "$(date -u +%FT%TZ) OK   peer analytics chain complete" >>"$STATUS_FILE"
