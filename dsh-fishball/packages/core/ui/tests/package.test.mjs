/**
 * fishball-ui's package rows (package/README.md): the manifest and boundary, the moved files, the
 * browser half, fishball-page's navigation (UI-POLISH-F §1, MULTI-3 F), the embed landing's locale
 * (R3B-07) and the restyled narrow sidebar (MULTI-3 F, headless Chromium). Registered once on the current DSH.
 */
import { registerPackageCases } from './package/cases.mjs'
import { registerEmbedLocaleCases } from './package/embed-locale-cases.mjs'
import { registerFrameLayoutCases } from './package/frame-layout-cases.mjs'
import { registerNavCases } from './package/nav-cases.mjs'

registerPackageCases()
registerNavCases()
registerEmbedLocaleCases()
registerFrameLayoutCases()
