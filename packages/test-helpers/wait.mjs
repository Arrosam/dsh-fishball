/** Waiting helpers. Harness timing only: never an oracle of the code under test. */
import { performance } from 'node:perf_hooks'

export const WAIT = Object.freeze({ pollMs: 50, settleRounds: 40 })

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Poll until `predicate()` is truthy; answers its last value (falsy on timeout). */
export async function until(predicate, timeoutMs, stepMs = WAIT.pollMs) {
  const end = Date.now() + timeoutMs
  for (;;) {
    const value = await predicate()
    if (value || Date.now() >= end) return value
    await sleep(stepMs)
  }
}

/** One turn of the event loop that mocked timers do not stop (setImmediate is never mocked here). */
export const spin = () => new Promise((resolve) => setImmediate(resolve))

/** Let pending promise chains and immediates run: `rounds` turns of the loop. */
export async function settle(rounds = WAIT.settleRounds) {
  for (let i = 0; i < rounds; i++) await spin()
}

/** Spin in real time for `ms` (MockTimers stand still meanwhile). */
export async function settleFor(ms) {
  const start = performance.now()
  while (performance.now() - start < ms) await spin()
}
