/** Small timing helpers shared by the worker and the tests. */
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

export const textOf = (content) => (Array.isArray(content) ? content.map((b) => b?.text ?? '').join('') : String(content ?? ''))
