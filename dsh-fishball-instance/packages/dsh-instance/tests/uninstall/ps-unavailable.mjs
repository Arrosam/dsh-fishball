/**
 * Preload for the "ps cannot be run" command row (`node --import <this> uninstall.js`): every spawn
 * of /bin/ps goes to an executable that does not exist, so the command meets the failure a machine
 * without a runnable ps gives (an error event with ENOENT, then close). Other spawns are untouched.
 * It replaces the builtin's export before the command's modules link (syncBuiltinESMExports).
 */
import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { FIXTURE } from './constants.mjs'

const spawn = childProcess.spawn
childProcess.spawn = (command, ...rest) => spawn(command === FIXTURE.ps ? FIXTURE.missingPs : command, ...rest)
syncBuiltinESMExports()
