#!/bin/sh
# V3-S6 round 2 (decisions of 2026-11-12): boots 1-4 on both SDKs with HMR on (standalone), and
# boots 1-3 with HMR off (hosted launch overlay). Same prerequisites as run-all.sh, plus the
# fishball-watchdog tarball.
set -u
cd "$(dirname "$0")/../.."
held() { (sleep 120) | env "$@"; }
for v in 0.2.1-rc.5 0.2.2-rc.1; do
  for hmr in on off; do
    held SDK=$v S6_STEP=1 S6_HMR=$hmr node spikes/v3-s6/decided.mjs > .runtime/s6-d1-$hmr-$v.log 2>&1; echo "$v hmr=$hmr 1 $?"
    H=$(grep "\[s6-home\]" .runtime/s6-d1-$hmr-$v.log | awk '{print $2}')
    held SDK=$v S6_STEP=2 S6_HMR=$hmr S6_HOME=$H node spikes/v3-s6/decided.mjs > .runtime/s6-d2-$hmr-$v.log 2>&1; echo "$v hmr=$hmr 2 $?"
    held SDK=$v S6_STEP=3 S6_HMR=$hmr S6_HOME=$H node spikes/v3-s6/decided.mjs > .runtime/s6-d3-$hmr-$v.log 2>&1; echo "$v hmr=$hmr 3 $?"
    if [ "$hmr" = on ]; then
      M=$(grep "\[s6-manager\]" .runtime/s6-d3-$hmr-$v.log | awk '{print $2}')
      L=$(node -p "require('$H/decided-state.json').leftover.sessionId")
      held SDK=$v S6_HOME=$H S6_MANAGER=$M S6_LEFTOVER=$L node spikes/v3-s6/resume.mjs > .runtime/s6-d4-$v.log 2>&1; echo "$v 4 $?"
    fi
  done
done
