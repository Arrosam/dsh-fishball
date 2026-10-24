/** P8 fixture: a profile-wide plugin with a static inject ['fishball']. */
import { sourceFixture } from '../source-fixture.mjs'

const plugin = sourceFixture('fbtest-source-static', { staticInject: true })
export const name = plugin.name
export const inject = plugin.inject
export const apply = plugin.apply
