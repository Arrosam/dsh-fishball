import { AsyncLocalStorage } from 'node:async_hooks'
import { setTimeout as delay } from 'node:timers/promises'

export const LIMIT = Object.freeze({
  // A case may restart several generations (each can spend 30 s on the SDK credential lock).
  // The held pnpm install/cancel and the failed offline removal also legitimately take over 70 s.
  caseMs: 180_000, cleanupMs: 20_000, stopMs: 10_000, commandMs: 30_000,
  heldInstallMs: 360_000, forceMs: 3_000, parentWatchMs: 3_100, pollMs: 100,
})

const current = new AsyncLocalStorage()

export async function withinDeadline(label, ms, fn, evidence = () => '') {
  const scope = { stages: new Set(), signal: AbortSignal.timeout(ms) }
  return current.run(scope, () => abortable(scope.signal, fn, () => {
    const stages = [...scope.stages].join(' → ') || 'case body'
    return new Error(label + ': deadline ' + ms + ' ms at ' + stages + evidence(), { cause: scope.signal.reason })
  }))
}

export async function abortable(signal, fn, error = () => signal.reason) {
  let abort
  try {
    if (signal.aborted) throw error()
    return await Promise.race([
      new Promise((_, reject) => { abort = () => reject(error()); signal.addEventListener('abort', abort, { once: true }) }),
      Promise.resolve().then(fn),
    ])
  } finally {
    signal.removeEventListener('abort', abort)
  }
}

export const caseSignal = () => current.getStore().signal

export async function stage(name, fn) {
  const scope = current.getStore()
  const entry = { toString: () => name }
  scope.signal.throwIfAborted()
  scope.stages.add(entry)
  try { return await fn() } catch (error) {
    // Keep original assertions intact; add context only to otherwise opaque transport failures.
    if (error instanceof TypeError && error.message === 'fetch failed') {
      throw new Error(name + ': fetch failed (' + (error.cause?.code ?? 'unknown') + ')', { cause: error })
    }
    throw error
  } finally { scope.stages.delete(entry) }
}

export function untilValue(fn, pollMs = LIMIT.pollMs) {
  return stage('poll for condition', async () => {
    const signal = caseSignal()
    for (;;) {
      signal.throwIfAborted()
      const value = await fn()
      if (value) return value
      await delay(pollMs, undefined, { signal })
    }
  })
}

export const testFetch = (url, options) => fetch(url, { ...options, signal: caseSignal() })
