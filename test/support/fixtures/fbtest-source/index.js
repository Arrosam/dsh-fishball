/** P8 fixture: a profile-wide plugin bundle with two rows; it waits for 'fishball' with ctx.inject. */
import { sourceFixture } from '../source-fixture.mjs'

const plugin = sourceFixture('fbtest-source')
export const name = plugin.name
export const inject = plugin.inject
export const apply = plugin.apply
