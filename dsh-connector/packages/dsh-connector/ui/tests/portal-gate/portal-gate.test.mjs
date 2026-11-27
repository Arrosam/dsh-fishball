// Portal Gate seam (dshConnectorUiPortal); see cases.mjs.
import { forEachVersion } from 'dsh-connector-test-helpers/cases'
import { registerPortalGateCases } from './cases.mjs'

forEachVersion(registerPortalGateCases)
