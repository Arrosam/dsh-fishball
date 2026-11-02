/** P8 fixture: installed but off in the profile (a Fishball-only candidate); waits for 'fishball' with ctx.inject. */
import { sourceFixture } from '../source-fixture.mjs'

const plugin = sourceFixture('fbtest-source-only')
export const name = plugin.name
export const inject = plugin.inject
export const apply = plugin.apply
