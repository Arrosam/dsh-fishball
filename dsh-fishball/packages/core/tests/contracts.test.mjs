// fishball-core's own contracts (K3a: core's copy of the connector surface checked against the vendored K1/K2,
// the hosted names, Connect, the fishball-ui seam's declarations; K3a-MULTI; F-OWN-SCHEMA), registered once on the
// current DSH; see contracts/README.md.
import { registerK3aCases } from './contracts/k3a-cases.mjs'
import { registerMultiSecurityCases } from './contracts/multi-security-cases.mjs'
import { registerOwnSchemaCases } from './contracts/own-schema-cases.mjs'
import { registerK3aTargetCases } from './contracts/targets-cases.mjs'

registerK3aCases()
registerK3aTargetCases()
registerMultiSecurityCases()
registerOwnSchemaCases()
