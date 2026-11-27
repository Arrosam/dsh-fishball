// fishball-core's private Skills (src/manager/skills.js, skills-store.js), registered once on the current
// DSH (fishball-test-helpers/dsh DSH_VERSION): T-SK use cases, EP, BVA, decision tables and state
// transitions, plus the native-oracle premises (DSH's own skill grammar and provider). See skills/README.md.
import { registerSkillBvaCases } from './skills/bva.mjs'
import { registerSkillDtCases } from './skills/dt.mjs'
import { registerSkillEpCases } from './skills/ep.mjs'
import { registerSkillStCases } from './skills/st.mjs'
import { registerSkillUcCases } from './skills/uc.mjs'

registerSkillUcCases()
registerSkillEpCases()
registerSkillBvaCases()
registerSkillDtCases()
registerSkillStCases()
