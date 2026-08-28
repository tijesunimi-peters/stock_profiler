#!/bin/sh
# Prepare the devbox's SSH identity and authorised keys, then hand off to sshd.
#
# Everything here is idempotent: the container is meant to be restarted freely, and a restart
# must not invalidate the host key or drop authorisations.
set -eu

KEYDIR=/etc/ssh/keys
AUTHDIR=/etc/devbox/keys
DEVHOME=/home/dev

mkdir -p "$KEYDIR"

# Host keys, generated once onto the volume. sshd_config explains why they live there.
for type in ed25519 rsa; do
    key="$KEYDIR/ssh_host_${type}_key"
    if [ ! -f "$key" ]; then
        echo "devbox: generating $type host key"
        ssh-keygen -q -t "$type" -f "$key" -N '' -C devbox
    fi
    chmod 600 "$key"
done

# A DIRECTORY of key files, merged, rather than one file. Two distinct sets of keys need in and
# they live in different places: the LAPTOP's public keys (this machine's ~/.ssh/authorized_keys
# -- the keys allowed to log in HERE) and this machine's own public key, so the box can be
# reached from the host without going out to ngrok and back. Anything Docker mounts in is
# skipped unless it is a regular non-empty file, so an absent optional source -- which Docker
# silently materialises as an empty DIRECTORY -- is ignored rather than fatal.
merged=$(mktemp)
if [ -d "$AUTHDIR" ]; then
    for src in "$AUTHDIR"/*; do
        [ -f "$src" ] || continue
        [ -s "$src" ] || continue
        echo "# from $(basename "$src")" >> "$merged"
        cat "$src" >> "$merged"
        echo >> "$merged"
    done
fi

# Fail loudly and early. A devbox that boots cleanly but cannot be logged into is the worst
# outcome available: `docker compose ps` shows healthy, the tunnel comes up, and the only
# symptom is a "Permission denied (publickey)" that says nothing about the cause.
keys=$(grep -c '^[a-z]' "$merged" 2>/dev/null || true)
if [ "${keys:-0}" -eq 0 ]; then
    echo "devbox: FATAL -- no authorised keys found in $AUTHDIR" >&2
    echo "devbox: point DEVBOX_AUTHORIZED_KEYS at a file of public keys, e.g. in .env:" >&2
    echo "devbox:   DEVBOX_AUTHORIZED_KEYS=\$HOME/.ssh/authorized_keys" >&2
    echo "devbox: (the default). It must hold the keys of the machine that will CONNECT." >&2
    rm -f "$merged"
    exit 1
fi

# Copied, not symlinked to the read-only mount: sshd enforces StrictModes on the real path,
# and a link into /etc/devbox would fail its ownership check.
install -d -m 700 -o dev -g dev "$DEVHOME/.ssh"
install -m 600 -o dev -g dev "$merged" "$DEVHOME/.ssh/authorized_keys"
rm -f "$merged"

echo "devbox: authorised ${keys} key(s)"

# The home volume is created empty on first start and Docker seeds it from the image; the
# chown is the cheap guard for the case where it was created some other way.
chown dev:dev "$DEVHOME"

# Named volumes mounted over a bind mount arrive owned by ROOT. Docker seeds a volume's ownership
# from the image only when the image itself has that path, and these paths exist only inside the
# bind-mounted repo -- so there is nothing to seed from and they land as root:root. The symptom is
# a bare "operation was rejected by your operating system" from npm, with nothing pointing at
# ownership. Non-recursive on purpose: the mount point is what needs to be writable, and a
# recursive chown over a populated node_modules is slow enough to look like a hang.
for owned in ${DEVBOX_OWNED_DIRS:-}; do
    [ -d "$owned" ] || continue
    chown dev:dev "$owned"
done

# --- editor + tmux configuration -----------------------------------------------------------
# Copied from read-only mounts rather than bind-mounted into place, and that is the whole design:
#
#   * nvim WRITES into its own config directory (lazy.nvim maintains lazy-lock.json there), so a
#     read-only bind mount at ~/.config/nvim would half-work and fail on plugin sync.
#   * a read-WRITE bind mount would let the container edit the host's real config, which is not a
#     trade anyone asked for.
#   * plugin DATA stays out entirely. ~/.local/share/nvim is 760 MB on the host and full of
#     compiled, host-built artefacts; the box builds its own into the home volume, once, and
#     keeps it across restarts.
#
# Refreshed on EVERY start, so the host is the single source of truth -- edit configs there and
# restart the box. The corollary is that config edits made INSIDE the box do not survive a
# restart, which is why this prints what it replaced.
DOTFILES=/etc/devbox/dotfiles

seed_dotfile() {
    src="$1"
    dest="$2"
    [ -e "$src" ] || return 0
    # Docker materialises a MISSING bind source as an empty directory, so "empty" means "not
    # provided" rather than "provided and empty". Without this check a machine with no nvim
    # config would get an empty ~/.config/nvim, which nvim treats as a real (broken) config.
    if [ -d "$src" ] && [ -z "$(ls -A "$src" 2>/dev/null)" ]; then
        return 0
    fi
    rm -rf "$dest"
    cp -a "$src" "$dest"
    chown -R dev:dev "$dest"
    echo "devbox: config: $(basename "$dest")"
}

install -d -m 755 -o dev -g dev "$DEVHOME/.config"
seed_dotfile "$DOTFILES/tmux.conf" "$DEVHOME/.tmux.conf"
seed_dotfile "$DOTFILES/tmux" "$DEVHOME/.tmux"
seed_dotfile "$DOTFILES/nvim" "$DEVHOME/.config/nvim"

echo "devbox: sshd listening on 22 (key-only, user 'dev')"
exec /usr/sbin/sshd -D -e
