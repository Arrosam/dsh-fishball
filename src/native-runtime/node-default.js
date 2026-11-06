/**
 * Defaults for the native host's two required launch settings, so a normal `dsh plugin add`
 * starts the child with no profile edit (B2).
 *
 * Why PATH and not `process.execPath`: the main DSH usually runs inside Electron (DSH.app), and its
 * execPath is the Electron binary, which the child cannot run as plain Node; the runtime's
 * verifyNode refuses it anyway. The first absolute `node` on the host's own PATH is the user's
 * plain Node. The choice is only a candidate: verifyNode still runs it, requires Node 22+ and
 * refuses Electron, so a wrong pick fails visibly as NATIVE_START_FAILED rather than running.
 * An explicit `nodeExecutable` / `executableSearchPath` in the row config always wins.
 */
import { accessSync, constants, statSync } from 'node:fs'
import path from 'node:path'

const NODE_DEFAULT = Object.freeze({
  /** The executable name looked up on PATH (POSIX; the attached lifecycle refuses win32). */
  command: 'node',
})

/** Absolute PATH entries only: the child's private PATH accepts nothing else. */
function absoluteSearchPath(searchPath) {
  return (searchPath ?? '').split(path.delimiter).filter((part) => part !== '' && path.isAbsolute(part))
}

/** The first executable regular `node` file on the given directories, or undefined. */
function findNode(directories) {
  for (const directory of directories) {
    const candidate = path.join(directory, NODE_DEFAULT.command)
    try {
      if (!statSync(candidate).isFile()) continue
      accessSync(candidate, constants.X_OK)
      return candidate
    } catch { /* not here */ }
  }
  return undefined
}

/**
 * The launch settings to use: the configured values, else the host PATH's defaults.
 * @param config - the native host row's config ({ nodeExecutable?, executableSearchPath? }).
 * @param searchPath - the host's PATH (process.env.PATH at the call).
 * @returns {{ nodeExecutable: string|undefined, executableSearchPath: string }} an undefined
 *   executable is refused by the runtime with INVALID_NODE.
 */
export function launchDefaults(config, searchPath) {
  const directories = absoluteSearchPath(searchPath)
  const nodeExecutable = config.nodeExecutable ?? findNode(directories)
  // The child's PATH: the configured one, else the chosen node's own directory plus the host's
  // absolute entries, so tools the child spawns resolve as they do for the user.
  const executableSearchPath = config.executableSearchPath
    ?? [...new Set([...(nodeExecutable === undefined ? [] : [path.dirname(nodeExecutable)]), ...directories])].join(path.delimiter)
  return { nodeExecutable, executableSearchPath }
}
