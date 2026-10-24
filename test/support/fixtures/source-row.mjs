/** P8: a plain HOST row (inserted by the overlay, owned by no catalog plugin) that captures the fishball service. */
import { sourceFixture } from './source-fixture.mjs'

const plugin = sourceFixture('fbtest-source-row')
export const name = plugin.name
export const inject = plugin.inject
export const apply = plugin.apply
