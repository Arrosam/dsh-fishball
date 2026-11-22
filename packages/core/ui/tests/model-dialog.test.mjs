/**
 * fishball-ui: the model dialog (F-WIRE, UI-POLISH-F §4, R-FIX-FUI F4), the per-target frame and the
 * sidebar DSH targets (MULTI-3), the ask card's source and handle (MULTI-3 requirement E), and the
 * running managed sessions under a target's row. Registered once on the current DSH; the rows are
 * listed in model-dialog/README.md.
 */
import { registerCatalogCases } from './model-dialog/catalog-cases.mjs'
import { registerDialogCases } from './model-dialog/dialog-cases.mjs'
import { registerModelPolishCases } from './model-dialog/polish-cases.mjs'
import { registerSessionsCases } from './model-dialog/sessions-cases.mjs'
import { registerTargetsCases } from './model-dialog/targets-cases.mjs'

registerDialogCases()
registerModelPolishCases()
registerCatalogCases()
registerTargetsCases()
registerSessionsCases()
