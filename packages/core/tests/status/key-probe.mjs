/**
 * One plain Node process standing for one DSH start, for "one notice per start = per process"
 * (dev session amendment 2026-11-16). This is not a DSH host and not a hosted child: it only loads
 * core's status module on the current DSH (FBTEST_DSH_VERSION, inherited from the runner), creates the status twice in this process (a
 * start and an HMR recompose) over an overridden guard report, and prints each notice's dedupe key
 * on its own line (`fbtest-key <key>`). The parent compares the keys across two such processes.
 */
import { GUARD, PROBE } from './constants.mjs'
import { settle, worldFor } from './world.mjs'

const closers = []
const t = { after: (fn) => closers.push(fn) }
const w = await worldFor(t, { guards: GUARD.overridden(GUARD.first) })
await w.recompose()
await settle()
for (const call of w.notice.calls) process.stdout.write(`${PROBE.keyLabel} ${call.dedupeKey}\n`)
while (closers.length > 0) await closers.pop()()
