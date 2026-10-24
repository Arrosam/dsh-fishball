/**
 * Spike fixture: stands in for DSH's browser approval prompt (no browser in a spike). Mounted
 * before dsh-fishball and prepended, so Fishball's broker (prepended later) runs first and its
 * next() reaches this, which answers 'rejected' and records the request.
 */
export const name = 'fishball-spike-browser-standin'
export function apply(ctx) {
  ctx.on('approval/request', (req) => {
    ;(globalThis.__p7Browser ??= []).push(req.toolName + ':' + req.callId)
    return 'rejected'
  }, { prepend: true })
}
