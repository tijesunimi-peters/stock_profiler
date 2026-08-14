#!/usr/bin/env bash
# Weekly disclosure-stats refresh, run on the VPS via secfin-disclosure-stats.timer.
# See docs/DEPLOYMENT_DO.md.
#
# Two steps, in order:
#
#   filing_index_backfill  /submissions/ (SEC)  -> filing_index
#   disclosure_stats       filing_index         -> disclosure_stats
#
# The index step is what makes the second meaningful: `disclosure_stats` places a filer against
# its SIC group, and before the index was backfilled market-wide that group held 5 of Apple's 231
# companies -- a "peer distribution" over four other filers. Re-running the stats without
# refreshing the index would just recompute the same numbers.
#
# ⚠️ --limit DEFAULTS TO 200 on --all-issuers. A bare run indexes 200 companies and reports
# success. The explicit cap below is deliberate, not decoration.
#
# Metadata only: one /submissions/ read per company, no documents fetched.
set -uo pipefail

APP_DIR="${SECFIN_APP_DIR:-/opt/secfin}"
LOG_DIR="${SECFIN_LOG_DIR:-/var/log/secfin}"
STATUS_FILE="$LOG_DIR/disclosure-stats.status"
COMPOSE_FILE="${SECFIN_COMPOSE_FILE:-docker-compose.prod.yml}"
ISSUER_CAP="${SECFIN_FILING_INDEX_CAP:-20000}"

mkdir -p "$LOG_DIR"

if ! cd "$APP_DIR"; then
    echo "$(date -u +%FT%TZ) FAIL cannot cd to $APP_DIR" >>"$STATUS_FILE"
    exit 1
fi

if ! docker compose -f "$COMPOSE_FILE" --profile analytics build analytics; then
    echo "$(date -u +%FT%TZ) FAIL could not build the analytics image" >>"$STATUS_FILE"
    exit 1
fi

# `code=$?` inside an `if ! cmd` branch records the status of the NEGATION (always 0), not of
# the command -- the same trap that let the peer-analytics chain run past a failure. Capture the
# status directly instead.
code=0
docker compose -f "$COMPOSE_FILE" --profile analytics run --rm analytics \
    python -m secfin.ingest.filing_index_backfill --all-issuers --limit "$ISSUER_CAP" || code=$?
if [ "$code" -ne 0 ]; then
    echo "$(date -u +%FT%TZ) FAIL filing_index_backfill exited $code -- chain stopped" \
        >>"$STATUS_FILE"
    exit "$code"
fi
echo "$(date -u +%FT%TZ) OK   filing_index_backfill (cap $ISSUER_CAP)" >>"$STATUS_FILE"

code=0
docker compose -f "$COMPOSE_FILE" --profile analytics run --rm analytics \
    python -m secfin.analytical.disclosure_stats || code=$?
if [ "$code" -ne 0 ]; then
    echo "$(date -u +%FT%TZ) FAIL disclosure_stats exited $code" >>"$STATUS_FILE"
    exit "$code"
fi
echo "$(date -u +%FT%TZ) OK   disclosure_stats" >>"$STATUS_FILE"
