// The release folder scripts/pack-v3.mjs writes, registered once on the current DSH; rows that need a
// release folder skip, saying so, when it is missing. See release/cases.mjs.
import { registerReleaseCases } from './release/cases.mjs'

registerReleaseCases()
