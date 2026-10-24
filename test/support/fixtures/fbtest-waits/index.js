/**
 * Fishball-only fixture whose row needs a host service (fbtestLateService) that the
 * worker provides only when the test asks: until then its rows wait (post-review change 1).
 */
import { bundleFixture } from '../../fixture-tools.mjs'

const plugin = bundleFixture('fbtest-waits', 'waits_echo')
export const name = plugin.name
export const inject = [...plugin.inject, 'fbtestLateService']
export const apply = plugin.apply
