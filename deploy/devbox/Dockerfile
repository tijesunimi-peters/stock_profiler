# --- remote development container ---------------------------------------------------------
# A long-lived box you SSH into and run tmux in, reachable from anywhere through the `ngrok`
# service beside it in docker-compose.yml. It exists so development can continue from a laptop
# that has nothing installed on it but an SSH client -- the constraint that ruled out Tailscale.
#
# Deliberately NOT layered on the `api` stage in the root Dockerfile, even though it shares the
# Python version. That image is the thing that serves production traffic and it stays a slim
# runtime with no compilers, no SSH daemon and no shell tooling in it. This one is the opposite
# on every count, so it is a separate image with its own file rather than a stage that could
# ever be reached by an untargeted build.
#
# Built from the REPO ROOT as context (see docker-compose.yml), so it can read nothing it does
# not copy explicitly -- and it copies nothing. The repo arrives at runtime as a bind mount, so
# edits made in here are edits on the host, and nothing you write is trapped inside the image.

FROM node:22-slim AS node

FROM python:3.11-slim

# Node from the official image rather than nodesource: same binary the `frontend` build stage
# uses, no third-party apt repo, and no key-rotation to chase.
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
 && node --version && npm --version

RUN apt-get update && apt-get install -y --no-install-recommends \
      openssh-server \
      tmux \
      git \
      curl \
      ca-certificates \
      less \
      procps \
      sqlite3 \
      build-essential \
      vim \
      # Editor-adjacent tooling. Not padding: the nvim config carried in from the host is
      # NvChad-based, and telescope wants `rg` and `fd`, treesitter compiles parsers with `cc`
      # (build-essential, above), and mason unpacks language servers with `unzip`. Without these
      # the editor starts and then fails one feature at a time, which is worse than not having it.
      ripgrep \
      fd-find \
      fzf \
      unzip \
      xz-utils \
 && rm -rf /var/lib/apt/lists/* \
 # Debian ships fd as `fdfind` (the name `fd` collides with another package). Everything that
 # looks for it looks for `fd`.
 && ln -s /usr/bin/fdfind /usr/local/bin/fd

# Neovim from the official release tarball, NOT apt: Debian's package trails badly, and the
# config being copied in targets the 0.12 series (the host runs 0.12.0-dev). A config written for
# a newer nvim fails at load on an older one, in ways that read as a broken config rather than a
# version skew.
#
# Pinned. An unpinned "latest" would mean the editor silently changes version under you on any
# rebuild -- and a rebuild is already how tmux sessions get lost, so it would arrive at the worst
# moment. Bump deliberately.
#
# x86_64 only. Every other layer here is arch-agnostic; this one would need the arm64 asset.
ARG NVIM_VERSION=v0.12.5
RUN curl -fsSL --retry 3 \
      "https://github.com/neovim/neovim/releases/download/${NVIM_VERSION}/nvim-linux-x86_64.tar.gz" \
      -o /tmp/nvim.tar.gz \
 && tar -xzf /tmp/nvim.tar.gz -C /opt \
 && rm /tmp/nvim.tar.gz \
 && ln -s /opt/nvim-linux-x86_64/bin/nvim /usr/local/bin/nvim \
 && nvim --version | head -1

# UID/GID 1000 to match the host user, so files created in the bind-mounted repo come out owned
# by you and not by root. Wrong ownership here is not cosmetic: it makes `git` in the host shell
# fail on files this container wrote.
ARG DEV_UID=1000
ARG DEV_GID=1000
RUN groupadd -g "${DEV_GID}" dev 2>/dev/null || true \
 && useradd -m -u "${DEV_UID}" -g "${DEV_GID}" -s /bin/bash dev \
 # `-p '*'`, and it is not optional. useradd leaves the shadow password field as `!`, which is
 # LOCKED -- and sshd refuses a locked account outright, before it ever looks at authorized_keys.
 # The symptom is a flat "Permission denied (publickey)" on the client with correct keys in place,
 # and the real reason ("User dev not allowed because account is locked") only in the server log.
 # `*` means "no password can ever match", which is what we want: still no password login, but
 # not locked, so pubkey auth is reached. Do NOT "fix" this with `passwd -d`, which sets an EMPTY
 # password rather than an impossible one.
 && usermod -p '*' dev

# `sshd` refuses to start without this directory, and it is not in the image by default.
RUN mkdir -p /run/sshd

# Host keys live on a volume (see compose), NOT in the image. Two reasons: an image-baked host key
# is a published private key, and a key regenerated per container start makes every reconnect
# after a rebuild fail the client's known_hosts check -- which trains you to ignore exactly the
# warning that matters.
COPY deploy/devbox/sshd_config /etc/ssh/sshd_config
COPY deploy/devbox/entrypoint.sh /usr/local/bin/devbox-entrypoint
RUN chmod +x /usr/local/bin/devbox-entrypoint

# Not a secret and not a security boundary -- the container is only reachable on loopback and
# through the tunnel. Documented so the compose file's mapping is readable.
EXPOSE 22

ENTRYPOINT ["/usr/local/bin/devbox-entrypoint"]
