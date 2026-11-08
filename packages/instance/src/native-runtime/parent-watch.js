import net from 'node:net'
import { LIFETIME } from './constants.js'

// Loaded by Node --import before DSH/plugin discovery. EOF is proof that our
// dedicated spawning-parent pipe disappeared, never authority over another PID.
let shutdown
let lost = false
let timer
export function registerParentShutdown(callback) {
  shutdown = callback
  if (lost) callback(LIFETIME.successExitCode)
}
const parent = new net.Socket({ fd: LIFETIME.parentFd, readable: true, writable: false })
const parentLost = () => {
  if (lost) return
  lost = true
  timer = setTimeout(() => process.exit(LIFETIME.failureExitCode), LIFETIME.childExitTimeoutMs)
  // A completed appExit must be able to quiesce naturally with its success code.
  // The fallback only needs to fire while other live handles prevent that exit.
  timer.unref()
  // If DSH has not mounted the native plugin yet, its standard SIGTERM handler
  // still knows how to dispose the application. No OS signal is sent.
  if (shutdown) shutdown(LIFETIME.successExitCode)
  else if (process.listenerCount(LIFETIME.gracefulSignal)) process.emit(LIFETIME.gracefulSignal)
  else process.exit(LIFETIME.successExitCode)
}
parent.once('end', parentLost)
parent.once('error', parentLost)
parent.resume()
parent.unref()
process.once('exit', () => { clearTimeout(timer); parent.destroy() })
