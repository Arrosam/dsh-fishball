// fishball-core's own settings page, registered once on the current DSH (fishball-test-helpers/dsh DSH_VERSION):
// core's client.js and client.settings.js alone in the scripted DSH page (settings/page.mjs): the page
// entry and form, the target cards and their Connect, the model select, the logo theme, the wake
// settings. See settings/README.md.
import { registerSettingsCases } from './settings/cases.mjs'

registerSettingsCases()
