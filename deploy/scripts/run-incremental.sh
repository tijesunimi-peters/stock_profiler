#!/usr/bin/env bash
# Daily incremental SEC ingest, run on the VPS via secfin-incremental.timer
# (deploy/systemd/secfin-incremental.{service,timer}). See docs/DEPLOYMENT.md.
#
# Runs the SAME image/command as local dev (docs/DEVELOPMENT.md #5):
#   docker compose run --rm api python -m secfin.ingest.incremental
# just with a fixed working directory and a status line written for the operator to
# check without reading journald syntax (journald still captures full stdout/stderr
# too, since this script's own output goes there as the unit's ExecStart).
set -uo pipefail

APP_DIR="${SECFIN_APP_DIR:-/opt/secfin}"
LOG_DIR="${SECFIN_LOG_DIR:-/var/log/secfin}"
STATUS_FILE="$LOG_DIR/incremental.status"
COMPOSE_FILE="${SECFIN_COMPOSE_FILE:-docker-compose.prod.yml}"

mkdir -p "$LOG_DIR"

if ! cd "$APP_DIR"; then
    echo "$(date -u +%FT%TZ) FAIL cannot cd to $APP_DIR" >>"$STATUS_FILE"
    exit 1
fi

if docker compose -f "$COMPOSE_FILE" run --rm api python -m secfin.ingest.incremental; then
    echo "$(date -u +%FT%TZ) OK incremental ingest completed" >>"$STATUS_FILE"
else
    code=$?
    echo "$(date -u +%FT%TZ) FAIL incremental ingest exited $code" >>"$STATUS_FILE"
    exit "$code"
fi
