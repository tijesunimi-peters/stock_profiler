#!/usr/bin/env bash
# Per-company open-market insider ratios for the Insider view's peer strip, run on the VPS via
# secfin-insider-peer-ratio.timer (deploy/systemd/secfin-insider-peer-ratio.{service,timer}).
# See docs/DEPLOYMENT_DO.md.
#
# Runs the SAME command as local dev (CLAUDE.md's command list):
#   docker compose --profile analytics run --rm analytics \
#     python -m secfin.analytical.insider_peer_ratio
#
# ⚠️ The `analytics` service is a DIFFERENT image from `api` -- it adds duckdb, which the serving
# image deliberately does not carry. It also sits behind a compose PROFILE, and `docker compose
# build` only builds services in active profiles, so a deploy that ran a bare build will not have
# it. The build below is therefore not belt-and-braces: without it the first timer fire on a fresh
# droplet fails with "image not found". It is a no-op once cached.
set -uo pipefail

APP_DIR="${SECFIN_APP_DIR:-/opt/secfin}"
LOG_DIR="${SECFIN_LOG_DIR:-/var/log/secfin}"
STATUS_FILE="$LOG_DIR/insider-peer-ratio.status"
COMPOSE_FILE="${SECFIN_COMPOSE_FILE:-docker-compose.prod.yml}"
WINDOW_DAYS="${SECFIN_INSIDER_RATIO_WINDOW_DAYS:-365}"
KEEP="${SECFIN_INSIDER_RATIO_KEEP:-8}"

mkdir -p "$LOG_DIR"

if ! cd "$APP_DIR"; then
    echo "$(date -u +%FT%TZ) FAIL cannot cd to $APP_DIR" >>"$STATUS_FILE"
    exit 1
fi

if ! docker compose -f "$COMPOSE_FILE" --profile analytics build analytics; then
    echo "$(date -u +%FT%TZ) FAIL could not build the analytics image" >>"$STATUS_FILE"
    exit 1
fi

if docker compose -f "$COMPOSE_FILE" --profile analytics run --rm analytics \
    python -m secfin.analytical.insider_peer_ratio \
    --window-days "$WINDOW_DAYS" --keep-snapshots "$KEEP"; then
    echo "$(date -u +%FT%TZ) OK insider peer ratios computed (${WINDOW_DAYS}d window)" \
        >>"$STATUS_FILE"
else
    code=$?
    echo "$(date -u +%FT%TZ) FAIL insider peer ratios exited $code" >>"$STATUS_FILE"
    exit "$code"
fi
