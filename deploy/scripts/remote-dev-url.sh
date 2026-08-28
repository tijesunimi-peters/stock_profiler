#!/usr/bin/env bash
# Print the ssh command for the current devbox tunnel.
#
# ngrok's tcp endpoint gets a NEW random host:port every time the agent restarts, so the
# connection string has to be looked up rather than remembered. This asks the agent's local
# inspector what address it was assigned and assembles the rest.
#
#   bash deploy/scripts/remote-dev-url.sh
set -euo pipefail

INSPECTOR="${NGROK_INSPECTOR:-http://127.0.0.1:4040}"

if ! curl -sf --max-time 5 "${INSPECTOR}/api/tunnels" -o /dev/null 2>/dev/null; then
    echo "No ngrok inspector at ${INSPECTOR}." >&2
    echo >&2
    echo "Start the tunnel:  docker compose --profile remote up -d" >&2
    echo "If it is already started, it failed on startup. Check:" >&2
    echo "                   docker compose logs ngrok" >&2
    echo >&2
    echo "The most likely cause is ERR_NGROK_8013 -- a TCP endpoint needs a card on" >&2
    echo "file even on the free tier (it is not charged). Add one at" >&2
    echo "https://dashboard.ngrok.com/settings#id-verification" >&2
    exit 1
fi

addr=$(curl -sf "${INSPECTOR}/api/tunnels" | python3 -c '
import json, sys
tunnels = json.load(sys.stdin).get("tunnels", [])
tcp = [t for t in tunnels if t.get("proto") == "tcp"]
if not tcp:
    # An agent that is up but has no tcp endpoint is the shape a plan/tier problem takes, so
    # say that rather than printing a broken command.
    sys.stderr.write("ngrok is running but published no tcp endpoint.\n")
    sys.stderr.write("Check `docker compose logs ngrok` -- a tcp endpoint may not be\n")
    sys.stderr.write("available on your ngrok plan.\n")
    sys.exit(1)
print(tcp[0]["public_url"].removeprefix("tcp://"))
')

host="${addr%:*}"
port="${addr##*:}"

cat <<EOF
devbox tunnel is up at ${addr}

Attach from the laptop:

  ssh -p ${port} dev@${host} \\
      -o HostKeyAlias=clearyfi-devbox \\
      -L 8000:api:8000 \\
      -L 5174:localhost:5174

Then, in that session:

  tmux new -A -s dev          # attach, or create if it is the first time

While it is open, on the laptop:

  http://localhost:8000       the API and the built app  (api container)
  http://localhost:5174       the vite dev server        (run \`npm run dev\` in the box)

HostKeyAlias pins known_hosts to the devbox's own persistent host key rather than to the
ngrok address, which changes on every agent restart -- without it you get a fresh
"authenticity of host" prompt each session and stop reading them.
EOF
