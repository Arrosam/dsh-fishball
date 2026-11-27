/**
 * Vocabulary for the Portal Gate seam test suite in `dsh-connector-ui`.
 * Derived strictly from the public requirements and contracts; no implementation internals read.
 */
import { BACKEND, EMBED, ROUTE, SLOT } from '../draw/constants.mjs'

export { BACKEND, EMBED, ROUTE, SLOT }

export const PORTAL = Object.freeze({
  serviceName: 'dshConnectorUiPortal',
  apiVersion: 1,
})

export const GATE_ATTR = Object.freeze({
  marker: 'data-fbtest-portal-gate',
  release: 'data-fbtest-portal-release',
  toggle: 'data-fbtest-portal-toggle',
  title: 'data-fbtest-portal-title',
})

export const GATE_STATE = Object.freeze({
  holding: 'holding',
  gateA: 'gate-a',
  gateB: 'gate-b',
})

export const OPENED_ROUTE = BACKEND.routes.opened[1]
export const IFRAME_TAG = 'iframe'
export const WAIT_MS = 3000
