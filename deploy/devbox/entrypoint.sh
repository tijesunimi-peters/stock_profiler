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

# --- editor + tmux configuration ------------------------------------------------------------
# Cloned from the dotfiles repo, which is the single source of truth -- not copied from this
# host. That matters for a box you reach from elsewhere: the config that follows you is the one
# in git, and a change made here can be committed and pushed rather than being a local drift
# nobody else sees.
#
# Layout in the repo: the ROOT is the nvim config; tmux.conf and tmux/themes sit beside it.
#
# Cloned over HTTPS because this runs unattended at container start, with no agent and no key --
# the repo is public, so a read needs no credential. The PUSH url is then set to the ssh form, so
# `git push` from inside the box uses the agent you forwarded when you connected
# (`AllowAgentForwarding yes` in sshd_config, `ForwardAgent yes` on the client).
#
# Symlinked into place rather than copied, deliberately: nvim writes lazy-lock.json into its own
# config directory, and with a symlink that write lands in the repo working tree where it can be
# reviewed and committed. A copy would strand it.
DOTFILES_REPO="${DEVBOX_DOTFILES_REPO:-https://github.com/tijesunimi-peters/nvim.git}"
DOTFILES_PUSH="${DEVBOX_DOTFILES_PUSH_URL:-git@github.com:tijesunimi-peters/nvim.git}"
DOTFILES_DIR="$DEVHOME/.config/dotfiles"
TPM_DIR="$DEVHOME/.tmux/plugins/tpm"

install -d -m 755 -o dev -g dev "$DEVHOME/.config"

if [ -n "$DOTFILES_REPO" ]; then
    if [ -d "$DOTFILES_DIR/.git" ]; then
        # Fast-forward only, and ONLY when the tree is clean. Uncommitted work in here is real
        # work -- config edited over ssh in the middle of a session -- and a container restart
        # must never be the thing that eats it.
        if [ -z "$(su dev -c "git -C '$DOTFILES_DIR' status --porcelain" 2>/dev/null)" ]; then
            su dev -c "git -C '$DOTFILES_DIR' pull --ff-only --quiet" 2>/dev/null \
                && echo "devbox: dotfiles: updated from ${DOTFILES_REPO}" \
                || echo "devbox: dotfiles: pull failed (offline?), using the checkout as-is"
        else
            echo "devbox: dotfiles: LOCAL CHANGES present, skipping pull -- commit or discard them"
        fi
    else
        if su dev -c "git clone --quiet '$DOTFILES_REPO' '$DOTFILES_DIR'" 2>/dev/null; then
            su dev -c "git -C '$DOTFILES_DIR' remote set-url --push origin '$DOTFILES_PUSH'" 2>/dev/null
            echo "devbox: dotfiles: cloned ${DOTFILES_REPO}"
        else
            echo "devbox: dotfiles: clone FAILED (no network?) -- editor will start unconfigured" >&2
        fi
    fi
fi

# Link the three destinations at the pieces of the repo. `ln -sfn` is idempotent and replaces a
# stale link without following it into the target.
if [ -d "$DOTFILES_DIR" ]; then
    # rm -rf first, every time. `ln -sfn` onto a REAL directory does not replace it -- it creates
    # the link inside it -- so a destination left over from an earlier copy-based run (or from a
    # previous layout) would silently nest instead of relinking.
    install -d -m 755 -o dev -g dev "$DEVHOME/.tmux"
    rm -rf "$DEVHOME/.config/nvim" "$DEVHOME/.tmux.conf" "$DEVHOME/.tmux/themes"
    su dev -c "ln -sfn '$DOTFILES_DIR' '$DEVHOME/.config/nvim'"
    su dev -c "ln -sfn '$DOTFILES_DIR/tmux.conf' '$DEVHOME/.tmux.conf'"
    su dev -c "ln -sfn '$DOTFILES_DIR/tmux/themes' '$DEVHOME/.tmux/themes'"
    echo "devbox: config: nvim + tmux linked from the dotfiles checkout"
fi

# TPM is NOT in the repo -- its .gitignore excludes the plugin directories -- but tmux.conf's
# last line sources ~/.tmux/plugins/tpm/tpm. Without this, every tmux start ends in an error and
# none of the declared plugins load. Cloned here rather than left to `prefix + I`, because a box
# you attach to over a tunnel should come up working.
if [ ! -d "$TPM_DIR/.git" ]; then
    install -d -m 755 -o dev -g dev "$DEVHOME/.tmux/plugins"
    su dev -c "git clone --quiet --depth 1 https://github.com/tmux-plugins/tpm '$TPM_DIR'" 2>/dev/null \
        && echo "devbox: config: tpm installed" \
        || echo "devbox: config: tpm clone failed (no network?) -- tmux plugins will not load" >&2
fi

echo "devbox: sshd listening on 22 (key-only, user 'dev')"
exec /usr/sbin/sshd -D -e
