#!/usr/bin/env bash
# Scheduled SQLite backup, run on the VPS via secfin-backup.timer
# (deploy/systemd/secfin-backup.{service,timer}). See docs/DEVELOPMENT.md #7 and
# docs/DEPLOYMENT.md for why the backup dir is a separate bind mount from the data
# volume -- that separation is preserved here unchanged, this script just automates the
# manual command already documented:
#   docker compose run --rm api python -m secfin.storage.backup
#
# Also prunes old snapshots under ./data/backups so a small VPS disk doesn't fill up --
# storage/backup.py itself has no retention policy (it's a plain snapshot writer), so
# that housekeeping lives here instead of in application code.
set -uo pipefail

APP_DIR="${SECFIN_APP_DIR:-/opt/secfin}"
LOG_DIR="${SECFIN_LOG_DIR:-/var/log/secfin}"
STATUS_FILE="$LOG_DIR/backup.status"
COMPOSE_FILE="${SECFIN_COMPOSE_FILE:-docker-compose.prod.yml}"
RETENTION_DAYS="${SECFIN_BACKUP_RETENTION_DAYS:-14}"

mkdir -p "$LOG_DIR"

if ! cd "$APP_DIR"; then
    echo "$(date -u +%FT%TZ) FAIL cannot cd to $APP_DIR" >>"$STATUS_FILE"
    exit 1
fi

if docker compose -f "$COMPOSE_FILE" run --rm api python -m secfin.storage.backup; then
    # Prune timestamped snapshots (secfin-<UTC timestamp>.db) older than the retention
    # window. Never touches secfin-latest.db -- restore.py's --latest flag depends on it
    # always being present and current.
    find ./data/backups -maxdepth 1 -name 'secfin-*.db' ! -name 'secfin-latest.db' \
        -mtime "+${RETENTION_DAYS}" -print -delete >>"$STATUS_FILE.pruned" 2>&1
    echo "$(date -u +%FT%TZ) OK backup completed (retention=${RETENTION_DAYS}d)" >>"$STATUS_FILE"
else
    code=$?
    echo "$(date -u +%FT%TZ) FAIL backup exited $code" >>"$STATUS_FILE"
    exit "$code"
fi
