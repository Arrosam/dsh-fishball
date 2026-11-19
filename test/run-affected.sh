#!/bin/bash
# usage: test/run-affected.sh <base-ref> [--sdk=0.2.1-rc.5|0.2.2-rc.1|both] [--list] [node --test args]
#        test/run-affected.sh --suite=<id>[,<id>…] | --all | --check
# Runs only the suites the working tree's changes against <base-ref> need (test/suites.mjs is the
# map; test/run-affected.mjs the selection). FBTEST_DSH_RUNTIME picks the SDK the host suites boot.
set -u
exec /opt/homebrew/bin/node "$(cd "$(dirname "$0")" && pwd)/run-affected.mjs" "$@"
