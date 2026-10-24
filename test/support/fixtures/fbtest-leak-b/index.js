/** Second Fishball-only fixture that provides a service of its own (fbtestLeakedB), for repeated breakage in one apply. */
import { bundleFixture } from '../../fixture-tools.mjs'

const plugin = bundleFixture('fbtest-leak-b', 'leak_b_echo')
export const name = plugin.name
export const inject = plugin.inject
export function apply(ctx) {
  plugin.apply(ctx)
  ctx.provide('fbtestLeakedB', { fbtest: true })
}
