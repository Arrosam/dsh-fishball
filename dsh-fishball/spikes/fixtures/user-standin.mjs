/**
 * S33 headless fixture: stands in for the user answering DSH's prompt first. Mounted before the
 * prompt-closer fixture and prepended, so it runs after it and before DSH's browser forwarder.
 * When `globalThis.__s33Standin = { outcome, afterMs }` is set it answers after that delay;
 * otherwise it passes the request on, and DSH's gateway holds it pending (no browser connected).
 */
export const name = 'fishball-spike-user-standin'
export function apply(ctx) {
  ctx.on('approval/request', (req, next) => {
    const plan = globalThis.__s33Standin
    if (!plan) return next()
    return new Promise((resolve) => setTimeout(() => resolve(plan.outcome), plan.afterMs))
  }, { prepend: true })
}
