/**
 * Passive safety preload for reviewed WD-1 tests; does not boot or import any product row.
 * Run with `--import ./test/verification/wd1-safe-preload.mjs` after isolating the environment.
 * Common Node network/process entry points fail closed even if product code catches the error.
 * This is a bounded-test tripwire, not an OS sandbox or a hostile/native-code security boundary.
 */
import assert from 'node:assert/strict'
import childProcess from 'node:child_process'
import net from 'node:net'
import dgram from 'node:dgram'
import { syncBuiltinESMExports } from 'node:module'
import { installNetworkTripwire } from '../fixtures/runtime-isolation-support.mjs'

const SAFETY = Object.freeze({
  emptyCount: 0,
  failedExitCode: 1,
  processMethods: Object.freeze(['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']),
  forbiddenProcess: 'Process launch forbidden in WD-1 verification: ',
  forbiddenNetwork: 'WD-1 verification attempted a network operation',
  forbiddenLaunch: 'WD-1 verification attempted a process launch',
})

const network = installNetworkTripwire()
const launches = []
function block(owner, key, attempts, message) {
  owner[key] = function () {
    attempts.push(key)
    throw new Error(message + key)
  }
}
for (const key of SAFETY.processMethods) block(childProcess, key, launches, SAFETY.forbiddenProcess)
// Covers cached JS launch functions which delegate through ChildProcess.spawn.
block(childProcess.ChildProcess.prototype, 'spawn', launches, SAFETY.forbiddenProcess)
// The shared tripwire covers outbound operations; local listeners are forbidden too.
block(net.Server.prototype, 'listen', network.attempts, SAFETY.forbiddenNetwork)
block(dgram.Socket.prototype, 'bind', network.attempts, SAFETY.forbiddenNetwork)
syncBuiltinESMExports()

export function assertNoForbiddenAttempts() {
  assert.equal(network.attempts.length, SAFETY.emptyCount, SAFETY.forbiddenNetwork)
  assert.equal(launches.length, SAFETY.emptyCount, SAFETY.forbiddenLaunch)
}

// Do not restore the guards during a test process: late shutdown work is in scope too.
process.on('exit', () => {
  if (network.attempts.length === SAFETY.emptyCount && launches.length === SAFETY.emptyCount) return
  process.exitCode = SAFETY.failedExitCode
  console.error('WD-1 safety tripwire failed: network attempts=%d; process attempts=%d', network.attempts.length, launches.length)
})
