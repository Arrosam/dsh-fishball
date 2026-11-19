import { ENDPOINT_LIMITS } from '../../mcp-schema/index.js'

/** The SDK's maxToolInputElements applies only to registered high-level tools. Our custom
 * tools/call handlers validate parsed JSON themselves, so apply the same count before either
 * schema validator. Do not recurse, copy arrays, or collect all child values before checking. */
export function exceedsToolInputLimit(args) {
  const pending = [args]
  let remaining = ENDPOINT_LIMITS.maxToolInputElements
  while (pending.length) {
    const value = pending.pop()
    if (value === null || typeof value !== 'object') continue
    if (Array.isArray(value) && value.length > remaining) return true
    for (const key in value) {
      if (!Object.hasOwn(value, key)) continue
      if (--remaining < 0) return true
      const child = value[key]
      if (child !== null && typeof child === 'object') pending.push(child)
    }
  }
  return false
}
