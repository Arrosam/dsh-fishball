/** A fixture world extension: one op that reads the base helpers and DSH's context, and a ready check. */
export const EXTENSION = Object.freeze({ op: 'fbtestPing', answer: 'fbtest-pong' })

export const ready = ({ ctx }) => ctx.get('appReady') !== undefined

export function ops({ ctx, model, world }) {
  return {
    [EXTENSION.op]: () => ({ answer: EXTENSION.answer, requests: model.requests.length, cwd: world.cwd, baseOps: typeof world.ops.turn, root: Boolean(ctx) }),
  }
}
