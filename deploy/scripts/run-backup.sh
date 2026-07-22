#!/usr/bin/env bash
# Scheduled SQLite backup, run on the VPS via secfin-backup.timer
# (deploy/systemd/secfin-backup.{service,timer}). See docs/DEVELOPMENT.md #7 and
# docs/DEPLOYMENT.md for why the backup dir is a separate bind mount from the data
# volume -- that separation is preserved here unchanged, this script just automates the
# manual command already documented:
#   docker compose run --rm api python -m secfin.storage.backup
#
# Retention is COUNT-based and lives in storage/backup.py (`--keep N`): it prunes to the newest N
# snapshots after each run. A count cap is bounded by disk regardless of snapshot size; the old
# time-based `find -mtime +14` here was NOT -- at 7.3G/snapshot, 7 days already overran the 48G
# droplet before the 14-day window could ever trigger (prod incident 2026-07-21, DEPLOYMENT_DO.md
# §6b). Set SECFIN_BACKUP_KEEP per host to fit its disk (droplet: small; a bigger data volume: more).
set -uo pipefail

APP_DIR="${SECFIN_APP_DIR:-/opt/secfin}"
LOG_DIR="${SECFIN_LOG_DIR:-/var/log/secfin}"
STATUS_FILE="$LOG_DIR/backup.status"
COMPOSE_FILE="${SECFIN_COMPOSE_FILE:-docker-compose.prod.yml}"
KEEP="${SECFIN_BACKUP_KEEP:-7}"

mkdir -p "$LOG_DIR"

if ! cd "$APP_DIR"; then
    echo "$(date -u +%FT%TZ) FAIL cannot cd to $APP_DIR" >>"$STATUS_FILE"
    exit 1
fi

# backup.py writes the snapshot AND prunes to the newest $KEEP (secfin-latest.db is never pruned).
if docker compose -f "$COMPOSE_FILE" run --rm api python -m secfin.storage.backup --keep "$KEEP"; then
    echo "$(date -u +%FT%TZ) OK backup completed (keep=${KEEP})" >>"$STATUS_FILE"
else
    code=$?
    echo "$(date -u +%FT%TZ) FAIL backup exited $code" >>"$STATUS_FILE"
    exit "$code"
fi
