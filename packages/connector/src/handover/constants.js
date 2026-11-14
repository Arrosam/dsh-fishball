/**
 * The hand-over service's own words (task C-ROUTE; K3 `fishballConnectorHandover`,
 * `host-services/handover.d.ts`, types only). The refusal codes are the shared K1/K2 words, so they
 * come from their owners; what K3 types without a runtime value is written once here.
 */
import { REFUSAL } from '../../mcp-schema/index.js'
import { EMIT_REFUSAL } from '../../tools/index.js'

/**
 * K3 `HandOverRefusalCode` / `TakeBackRefusalCode`, each from its one runtime owner. `handOver`
 * checks them in this order: `unknown-session`, `conflict`, `no-fishball` (K3 README, PROPOSED).
 */
export const HANDOVER_REFUSAL = Object.freeze({
  unknownSession: REFUSAL.unknownSession,
  conflict: REFUSAL.conflict,
  noFishball: EMIT_REFUSAL.noFishball,
  notManaged: REFUSAL.notManaged,
})

/** The Cordis service name and its version (K3 host-services/index.d.ts `Context`, README). */
export const HANDOVER_SERVICE = Object.freeze({
  name: 'fishballConnectorHandover',
  apiVersion: 1,
  label: 'fishball-connector: fishballConnectorHandover',
})

/** K3: an omitted `note` is carried as the empty string (README "note", design §3.6). */
export const NO_NOTE = ''
