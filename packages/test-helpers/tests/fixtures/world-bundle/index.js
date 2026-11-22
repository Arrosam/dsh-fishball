/** A fixture bundle row for the DSH world's install path: it provides one service, `fbtestWorldRow`. */
export const name = 'fbtest-world-bundle'
export function apply(ctx) {
  ctx.provide('fbtestWorldRow', { fbtest: true })
}
