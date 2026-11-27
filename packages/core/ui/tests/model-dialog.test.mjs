// fishball-ui: the retired model dialog stays absent; sidebar targets, ask-card sources and
// running managed sessions retain their coverage. See model-dialog/README.md.
import { registerDialogCases } from './model-dialog/dialog-cases.mjs'
import { registerSessionsCases } from './model-dialog/sessions-cases.mjs'
import { registerTargetsCases } from './model-dialog/targets-cases.mjs'

registerDialogCases()
registerTargetsCases()
registerSessionsCases()
