/**
 * Vocabulary of the uninstall cases. Expected values come from the package README ("Uninstall": it
 * removes `<DSH_HOME>/fishball/runtime` and nothing else; refusal codes CHILD_RUNNING,
 * CHILD_STATE_UNKNOWN, …), the runtime's uninstall() JSDoc (a recorded child alive → CHILD_RUNNING;
 * its state unknown, no pid record or ps unreadable → CHILD_STATE_UNKNOWN; nothing removed) and the
 * user's B8 amendment (each cause of CHILD_STATE_UNKNOWN has its own message and remedy).
 */
export const CODE = Object.freeze({ running: 'CHILD_RUNNING', unknown: 'CHILD_STATE_UNKNOWN' })
/** The command's exit codes: done 0, refused 1. */
export const EXIT = Object.freeze({ done: 0, refused: 1 })
export const TEXT = Object.freeze({
  absent: 'Nothing to remove',
  /** The remedy that can never succeed for an unknown state. */
  retry: /wait a few seconds/i,
})

/** The two causes of CHILD_STATE_UNKNOWN and what the command's stderr must and must not say. */
export const UNKNOWN_CAUSES = Object.freeze([
  Object.freeze({
    cause: 'ps cannot be run', pid: true, psUnavailable: true,
    mustSay: Object.freeze([/could not (?:be )?check/i, /\/bin\/ps could not be run/i, /quit DSH/i, /run (?:this|the|it)[^.]*where[^.]*works/i]),
    namesRoot: false,
    mustNotSay: Object.freeze([/launch record/i]),
  }),
  Object.freeze({
    cause: 'no pid record', pid: false, psUnavailable: false,
    mustSay: Object.freeze([/cannot be confirmed/i, /launch record is missing/i, /nothing was removed/i, /stop DSH/i, /no Fishball child process is left running/i, /yourself/i]),
    // The folder the user deletes is the runtime root.
    namesRoot: true,
    mustNotSay: Object.freeze([/where[^.]*works/i, /\/bin\/ps/]),
  }),
])

/** The runtime tree under the main home and the records a launch leaves there. */
export const LAYOUT = Object.freeze({
  runtime: Object.freeze(['fishball', 'runtime']),
  active: 'active.json',
  pid: 'pid.json',
  launches: 'launches',
  format: 1,
  installAnchor: '/dshi/dsh/package.json',
  fileMode: 0o600,
  dirMode: 0o700,
})

export const FIXTURE = Object.freeze({
  tempPrefix: 'dshi-uninstall-',
  homeDir: 'main',
  /** The recorded child's pid; only the fake ps is ever asked about it. */
  pid: 424242,
  /** What `/bin/ps -p <pid> -o pid=` prints for a listed process. */
  listed: (pid) => '  ' + pid + '\n',
  /** A ps that cannot exist anywhere, so its spawn fails with ENOENT. */
  missingPs: '/nonexistent/dshi-uninstall/ps',
  ps: '/bin/ps',
})

/**
 * ps answers (decision table over how the probe ends × what it printed) and what B8 requires.
 * A probe is `{throws}` (spawn throws), `{error}` (an error event, then close with a negative
 * code, as a missing or forbidden executable gives) or `{exit, output}` (a normal run).
 */
export const PS_ROWS = Object.freeze([
  Object.freeze({ row: 'alive: exit 0, pid listed', probe: { exit: 0, output: 'listed' }, outcome: 'running' }),
  Object.freeze({ row: 'dead: exit 1, empty output', probe: { exit: 1, output: '' }, outcome: 'removed' }),
  Object.freeze({ row: 'cannot spawn: spawn throws', probe: { throws: true }, outcome: 'unknown' }),
  Object.freeze({ row: 'cannot spawn: error event', probe: { error: 'EPERM', exit: -1 }, outcome: 'unknown' }),
  Object.freeze({ row: 'fails: exit 2', probe: { exit: 2, output: '' }, outcome: 'unknown' }),
  Object.freeze({ row: 'unreadable: exit 0, empty output', probe: { exit: 0, output: '' }, outcome: 'unknown' }),
  Object.freeze({ row: 'unreadable: exit 0, garbage', probe: { exit: 0, output: 'not a pid\n' }, outcome: 'unknown' }),
  Object.freeze({ row: 'unreadable: exit 1, output', probe: { exit: 1, output: 'listed' }, outcome: 'unknown' }),
])
