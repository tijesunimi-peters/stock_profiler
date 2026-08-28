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
      ripgrep \
      sqlite3 \
      build-essential \
      vim-tiny \
 && rm -rf /var/lib/apt/lists/*

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
