/**
 * The K3 values these cases check, from the connector's frozen contract (host-services/child.d.ts,
 * K3 as amended by I-HOST, 2026-11-16, and contract C, 2026-11-21) and the instance README. Nothing
 * comes from an implementation.
 */
import path from 'node:path'
import { REPO } from '@dsh-instance/test-helpers/constants'

/** K3 `dshInstanceChild` (child.d.ts). */
export const K3 = Object.freeze({
  service: 'DshInstanceChild',
  apiVersion: 1,
  members: Object.freeze(['apiVersion', 'status', 'onChange', 'origin', 'admit', 'retry', 'reconnect', 'targetStatus', 'agentEntry', 'providerSync']),
  /** Every member that is called (all but the two data members). */
  data: Object.freeze(['apiVersion', 'providerSync']),
  reconnectCodes: Object.freeze(['not-ready', 'connector-missing', 'operation-failed', 'credentials-unwritable']),
  reconnectType: 'ReconnectRefusalCode',
  /** R-HOST-07 / Q-G7 as the contract words it: sync copies the providers and their model lists, nothing else. */
  syncWording: Object.freeze([/model lists?/i, /nothing else/i]),
})

/** The instance as this repository's checkout ships it (its manifest names its files). */
export const INSTANCE = Object.freeze({
  dir: path.join(REPO, 'packages', 'dsh-instance'),
  /** The child locator module: the host row builds the K3 service with it (src/host/locator.js JSDoc). */
  locator: path.join(REPO, 'packages', 'dsh-instance', 'src', 'host', 'locator.js'),
  uninstall: path.join(REPO, 'packages', 'dsh-instance', 'uninstall.js'),
})
