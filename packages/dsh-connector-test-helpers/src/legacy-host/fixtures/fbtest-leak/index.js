/**
 * Fishball-only fixture that provides a service of its own (fbtestLeaked) besides its tool.
 * Whether that counts as a leaked service is the plugin's audit to decide (CASES.md A33).
 */
import { bundleFixture } from '../../fixture-tools.mjs'

const plugin = bundleFixture('fbtest-leak', 'leak_echo')
export const name = plugin.name
export const inject = plugin.inject
export function apply(ctx) {
  plugin.apply(ctx)
  ctx.provide('fbtestLeaked', { fbtest: true })
}
