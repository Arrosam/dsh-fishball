/**
 * Preload for the UNINST-CLI "ps cannot be run" row (`node --import <this> uninstall.js`): every
 * spawn of `/bin/ps` is sent to an executable that does not exist, so the command meets the real
 * failure a machine without a runnable ps gives (an `error` event with ENOENT, then `close`). Other
 * spawns are untouched. It replaces the builtin's export before the command's modules are linked
 * (syncBuiltinESMExports), so the command's own `import { spawn } from 'node:child_process'` sees it.
 * Whether the real /bin/ps runs here (a sandbox may forbid it) then no longer decides the row.
 */
import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { PS_UNAVAILABLE } from './constants.mjs'

const spawn = childProcess.spawn
childProcess.spawn = (command, ...rest) => spawn(command === PS_UNAVAILABLE.command ? PS_UNAVAILABLE.missing : command, ...rest)
syncBuiltinESMExports()
