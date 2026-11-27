#!/bin/sh
# V3-S6: run every scenario on both installed SDKs, read-only against them. Stdin is held open
# because DSH's launcher stops on stdin EOF (dsh-cmdline). Throwaway homes go to .runtime/v3-s6/.
# Prerequisite: the three fixture tarballs in .runtime/tarballs/ (npm pack spikes/v3-s6/fixtures/*,
# with npm_config_cache under .runtime/ and npm_config_userconfig=/dev/null).
set -u
cd "$(dirname "$0")/../.."
held() { (sleep 120) | env "$@"; }
for v in 0.2.1-rc.5 0.2.2-rc.1; do
  SDK=$v node spikes/v3-s6/order.mjs > /dev/null; echo "$v order $?"
  held SDK=$v node spikes/v3-s6/standalone.mjs > .runtime/s6-a-$v.log 2>&1; echo "$v standalone $?"
  H=$(node -p "require('./spikes/v3-s6/results/standalone-$v.json').home")
  held SDK=$v S6_HOME=$H node spikes/v3-s6/standalone.mjs > .runtime/s6-r-$v.log 2>&1; echo "$v reboot $?"
  held SDK=$v S6_HOME=$H S6_LABEL=standalone node spikes/v3-s6/browser.mjs > .runtime/s6-b-$v.log 2>&1; echo "$v browser $?"
  held SDK=$v S6_MEMBERS=core node spikes/v3-s6/standalone.mjs > .runtime/s6-c-$v.log 2>&1; echo "$v core-only $?"
  H=$(node -p "require('./spikes/v3-s6/results/core-only-$v.json').home")
  held SDK=$v S6_HOME=$H S6_LABEL=core-only node spikes/v3-s6/browser.mjs > .runtime/s6-cb-$v.log 2>&1; echo "$v core-only browser $?"
  for o in core-first core-last; do held SDK=$v S6_ORDER=$o node spikes/v3-s6/hosted.mjs > .runtime/s6-h-$o-$v.log 2>&1; echo "$v hosted $o $?"; done
done
