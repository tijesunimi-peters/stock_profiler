#!/usr/bin/env bash
# Convenience installer for the systemd timers -- run once per VPS, as root (or via
# sudo), after cloning the repo to /opt/secfin (see docs/DEPLOYMENT.md for the full
# runbook this is one step of). Idempotent: safe to re-run after editing a unit file.
set -euo pipefail

APP_DIR="${SECFIN_APP_DIR:-/opt/secfin}"
LOG_DIR="${SECFIN_LOG_DIR:-/var/log/secfin}"
# Overridable so the enable/skip logic can be exercised without writing to /etc.
UNIT_DIR="${SECFIN_UNIT_DIR:-/etc/systemd/system}"

if [ "$(id -u)" -ne 0 ]; then
    echo "Run as root (sudo $0)." >&2
    exit 1
fi

if ! id -u secfin >/dev/null 2>&1; then
    echo "Creating unprivileged 'secfin' user (added to the docker group for compose access)..."
    useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin secfin
    usermod -aG docker secfin
fi

mkdir -p "$LOG_DIR"
chown secfin:secfin "$LOG_DIR"

# The timers run docker compose as the secfin user, and compose must read .env --
# which the operator typically created as root with mode 600 (it holds
# SECFIN_ADMIN_SECRET, so group/world bits stay off; ownership is the fix).
# Found the hard way on the first scheduled run (2026-07-15): "open /opt/secfin/.env:
# permission denied", exit 1, before the job did anything.
if [ -f "$APP_DIR/.env" ]; then
    chown secfin:secfin "$APP_DIR/.env"
fi

echo "Installing systemd units into $UNIT_DIR..."
cp "$(dirname "$0")/systemd/"secfin-*.service "$(dirname "$0")/systemd/"secfin-*.timer "$UNIT_DIR/"

systemctl daemon-reload

for t in secfin-incremental secfin-insider-peer-ratio secfin-peer-analytics \
         secfin-disclosure-stats; do
    systemctl enable --now "$t.timer"
done

# secfin-backup.timer is handled SEPARATELY and is never enabled by this script.
#
# It was stopped and disabled deliberately on 2026-07-21 (docs/DEPLOYMENT_DO.md 6): each run
# writes a full multi-gigabyte SQLite snapshot to the droplet's own disk, which filled it, and
# the standing ruling is that off-droplet (Spaces) backups get wired before it runs again. This
# script is idempotent and meant to be re-run after editing any unit -- so an unconditional
# `enable --now` here would silently undo that ruling every time someone added a timer.
#
# Re-enabling is a deliberate act with a prerequisite, so it is left to the operator. An
# already-enabled timer is left exactly as it is; this only ever declines to turn it ON.
backup_state="$(systemctl is-enabled secfin-backup.timer 2>/dev/null || true)"
case "$backup_state" in
    enabled|enabled-runtime)
        echo "secfin-backup.timer: already enabled -- left alone."
        ;;
    *)
        echo
        echo "  ⚠️  secfin-backup.timer is NOT enabled (state: ${backup_state:-not installed})."
        echo "      Deliberate: it writes a full DB snapshot to the droplet's own disk and"
        echo "      filled it once. Wire off-droplet backups first, then enable it yourself:"
        echo "          systemctl enable --now secfin-backup.timer"
        echo "      Until then the database is unprotected -- that is a known, accepted state,"
        echo "      not an oversight this script should quietly fix."
        ;;
esac

echo
echo "Installed. Check status with:"
echo "  systemctl list-timers 'secfin-*'"
echo "  journalctl -u secfin-incremental.service --since today"
echo "  tail -f $LOG_DIR/*.status"
