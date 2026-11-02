/** Fixture bundle linked into the profile by a test while DSH runs, outside DSH's plugin manager (the Refresh cases). */
import { bundleFixture } from '../../fixture-tools.mjs'

const plugin = bundleFixture('fbtest-refresh', 'refresh_echo')
export const name = plugin.name
export const inject = plugin.inject
export const apply = plugin.apply
