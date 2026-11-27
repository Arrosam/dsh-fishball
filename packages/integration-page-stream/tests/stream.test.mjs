// Core's one page stream with fishball-ui and fishball-taskboard in a booted DSH (wire from Node, the
// real page in Chromium), registered once on the current DSH; see stream/cases.mjs.
import { registerStreamCases } from './stream/cases.mjs'

registerStreamCases()
