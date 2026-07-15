#!/usr/bin/env bash
# Convenience installer for the systemd timers -- run once per VPS, as root (or via
# sudo), after cloning the repo to /opt/secfin (see docs/DEPLOYMENT.md for the full
# runbook this is one step of). Idempotent: safe to re-run after editing a unit file.
set -euo pipefail

APP_DIR="${SECFIN_APP_DIR:-/opt/secfin}"
LOG_DIR="${SECFIN_LOG_DIR:-/var/log/secfin}"
UNIT_DIR="/etc/systemd/system"

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
systemctl enable --now secfin-incremental.timer
systemctl enable --now secfin-backup.timer

echo
echo "Installed. Check status with:"
echo "  systemctl list-timers 'secfin-*'"
echo "  journalctl -u secfin-incremental.service --since today"
echo "  tail -f $LOG_DIR/incremental.status $LOG_DIR/backup.status"
