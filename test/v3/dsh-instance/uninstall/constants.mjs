/**
 * Vocabulary for the uninstall cases (E-FIX-1 B8, P2): `uninstall.js [--home <DSH_HOME>]` and the
 * runtime's `uninstall()` must tell a child proven alive from a child whose state cannot be checked.
 *
 * Expected values come from the B8 requirement and the root README's refusal table ("Uninstall"),
 * never from the implementation. `CHILD_STATE_UNKNOWN` is the requirement's literal.
 */
import path from 'node:path'

export const CODE = Object.freeze({
  running: 'CHILD_RUNNING',
  unknown: 'CHILD_STATE_UNKNOWN',
})

/** The command's exit codes (UNINSTALL.exitCode: done 0, refused 1). */
export const EXIT = Object.freeze({ done: 0, refused: 1 })

/** What the command prints (README "Uninstall"). */
export const TEXT = Object.freeze({
  absent: 'Nothing to remove',
  /** The unknown refusal says the child's state could not be checked (so "wait and retry" is not its only remedy). */
  cannotCheck: /could not (?:be )?check/i,
})

/** Layout names under the main home (README: the command removes `<DSH_HOME>/fishball/runtime`). */
export const LAYOUT = Object.freeze({
  runtime: Object.freeze(['fishball', 'runtime']),
  /** The runtime's record names (constants.js RUNTIME.active / .pid, published by the runtime). */
  active: 'active.json',
  pid: 'pid.json',
  launches: 'launches',
  format: 1,
  /** A launch record's install anchor; any string is a valid record, the path is never opened. */
  installAnchor: '/fbtest/dsh/package.json',
  fileMode: 0o600,
  dirMode: 0o700,
})

export const MODULES = Object.freeze({
  runtime: path.join('src', 'native-runtime', 'index.js'),
  files: path.join('src', 'native-runtime', 'files.js'),
  command: 'uninstall.js',
  homeFlag: '--home',
})

export const FIXTURE = Object.freeze({
  tempPrefix: 'fbtest-uninstall-',
  homeDir: 'main',
  /** The recorded child's pid; the fake ps is the only thing ever asked about it. */
  pid: 424242,
  /** What `/bin/ps -p <pid> -o pid=` prints for a listed process (right-aligned pid, newline). */
  listed: (pid) => `  ${pid}\n`,
  /** The command runs with no DSH_HOME, so only --home names the home. */
  env: Object.freeze({ DSH_HOME: '' }),
})

/**
 * The ps answers (decision table over "how the probe ends" × "what it printed"). `outcome` is
 * what B8 requires: `running` and `unknown` are refusals by code, `removed` deletes the tree.
 * A probe answer is `{throws}` (spawn throws synchronously), `{error}` (the child emits `error`,
 * then `close` with Node's negative errno, as a missing or forbidden executable does), or
 * `{exit, output}` (a normal run).
 */
export const PS_ROWS = Object.freeze([
  // ps lists the recorded pid: the child is proven alive (unchanged behaviour).
  Object.freeze({ row: 'alive: exit 0, pid listed', probe: { exit: 0, output: 'listed' }, outcome: 'running' }),
  // ps exits 1 with nothing printed: the child is proven dead, so the tree goes.
  Object.freeze({ row: 'dead: exit 1, empty output', probe: { exit: 1, output: '' }, outcome: 'removed' }),
  // spawn itself throws: ps cannot be started at all.
  Object.freeze({ row: 'cannot spawn: spawn throws', probe: { throws: true }, outcome: 'unknown' }),
  // spawn reports an error event (ENOENT/EPERM: ps missing or forbidden, a sandbox).
  Object.freeze({ row: 'cannot spawn: error event', probe: { error: 'EPERM', exit: -1 }, outcome: 'unknown' }),
  // ps fails with another status (a usage or permission failure of ps itself).
  Object.freeze({ row: 'fails: exit 2', probe: { exit: 2, output: '' }, outcome: 'unknown' }),
  // BVA beside "dead": exit 0 but nothing printed is not an answer about the pid.
  Object.freeze({ row: 'unreadable: exit 0, empty output', probe: { exit: 0, output: '' }, outcome: 'unknown' }),
  // BVA beside "alive": exit 0 with text that is not the pid.
  Object.freeze({ row: 'unreadable: exit 0, garbage', probe: { exit: 0, output: 'not a pid\n' }, outcome: 'unknown' }),
  // BVA beside "dead": exit 1 with output is not the empty answer B8 calls proven dead.
  Object.freeze({ row: 'unreadable: exit 1, output', probe: { exit: 1, output: 'listed' }, outcome: 'unknown' }),
])
