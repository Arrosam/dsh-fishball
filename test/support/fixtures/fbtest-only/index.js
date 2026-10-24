/** Fixture bundle installed in the profile but not enabled there (Fishball-only candidate). */
import { bundleFixture } from '../../fixture-tools.mjs'

const plugin = bundleFixture('fbtest-only', 'only_echo')
export const name = plugin.name
export const inject = plugin.inject
export const apply = plugin.apply
