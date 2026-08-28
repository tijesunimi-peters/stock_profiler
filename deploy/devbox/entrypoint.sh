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

# Authorised keys are read by sshd DIRECTLY from the read-only mounts -- see AuthorizedKeysFile
# in sshd_config. Nothing is copied, which is the point: a key added to the host's
# ~/.ssh/authorized_keys works on the next connection, with no restart and no second copy to keep
# in sync. All this does is fail loudly when there is nothing to read.
#
# A devbox that boots cleanly but cannot be logged into is the worst outcome available:
# `docker compose ps` shows healthy, the tunnel comes up, and the only symptom is a "Permission
# denied (publickey)" that says nothing about the cause.
keys=0
for src in "$AUTHDIR"/*; do
    # Docker materialises a MISSING bind source as an empty DIRECTORY, so a non-file here means
    # "not provided" rather than "provided and empty".
    [ -f "$src" ] || continue
    n=$(grep -c '^[a-z]' "$src" 2>/dev/null || echo 0)
    keys=$((keys + n))
done

if [ "$keys" -eq 0 ]; then
    echo "devbox: FATAL -- no authorised keys found in $AUTHDIR" >&2
    echo "devbox: point DEVBOX_AUTHORIZED_KEYS at a file of public keys, e.g. in .env:" >&2
    echo "devbox:   DEVBOX_AUTHORIZED_KEYS=\$HOME/.ssh/authorized_keys" >&2
    echo "devbox: (the default). It must hold the keys of the machine that will CONNECT." >&2
    exit 1
fi

echo "devbox: authorised ${keys} key(s), read live from $AUTHDIR"

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
