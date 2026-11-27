/** Post-review fixture bundle (installed, not enabled in the profile). */
import { bundleFixture } from '../../fixture-tools.mjs'

const plugin = bundleFixture('fbtest-idinsert', 'idinsert_echo')
export const name = plugin.name
export const inject = plugin.inject
export const apply = plugin.apply
