/**
 * Fishball-only fixture whose apply throws after starting its effect: mounting it throws
 * rather than failing a row check (CASES.md A35). Records apply/dispose like the others.
 */
import { bundleFixture } from '../../fixture-tools.mjs'

const plugin = bundleFixture('fbtest-throws', 'throws_echo')
export const name = plugin.name
export const inject = plugin.inject
export function apply(ctx) {
  plugin.apply(ctx)
  throw new Error('fbtest-throws: apply throws on purpose')
}
