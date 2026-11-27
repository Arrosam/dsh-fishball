#!/bin/sh
# Run one spike with stdin held open: DSH's launcher shuts down on stdin EOF (dsh-cmdline).
# The spike itself exits; the feeding `sleep` is bounded so nothing lingers.
# Usage: spikes/run.sh spikes/<file>.mjs
set -eu
cd "$(dirname "$0")/.."
(sleep "${SPIKE_STDIN_SECONDS:-150}") | /opt/homebrew/bin/node "$@"
