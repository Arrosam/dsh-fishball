/** Harness waits (never oracles). */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Poll until predicate() is truthy; returns its last value (falsy on timeout). */
export async function until(predicate, timeoutMs, stepMs = 50) {
  const end = Date.now() + timeoutMs
  for (;;) {
    const value = await predicate()
    if (value || Date.now() >= end) return value
    await sleep(stepMs)
  }
}

/** Let pending promises and immediates run `rounds` times. */
export async function settle(rounds = 40) {
  for (let i = 0; i < rounds; i++) await new Promise((resolve) => setImmediate(resolve))
}
