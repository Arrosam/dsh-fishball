/**
 * UIM-DT-01's C-WIRE row uses the relayed C-UI-BACKEND contract, not product implementation.
 * Service names and apiVersion have one oracle: the existing backend TEST surface.
 * The wire world's timing budget and real connector-only scenario are shared test support.
 */
export { SURFACE as UI_CONTRACT } from '../../dsh-connector/ui/constants.mjs'
export { BUDGET } from '../../dsh-connector/wire/constants.mjs'

/** Case identity and fixture data, not product values. */
export const ROW = Object.freeze({
  id: 'UIM-DT-01',
  part: 'C-WIRE',
  title: 'the real connector row provides its UI backend at app ready',
  provision: 'the UI service is present with its contracted apiVersion at app ready',
})
export const FIXTURE = Object.freeze({ scenario: 'uim-dt-01-connector-ready' })
export const WORKER = Object.freeze({ ready: 'waitReady', row: 'row' })

/** Failure explanations describe the public boundary being checked. */
export const MESSAGE = Object.freeze({
  ready: 'DSH did not reach app ready',
  row: 'the real connector row is absent',
  active: 'the real connector row is not active',
  service: 'the UI service was not provided when app ready fired',
  version: 'the UI service at app ready does not have the contracted apiVersion',
})
