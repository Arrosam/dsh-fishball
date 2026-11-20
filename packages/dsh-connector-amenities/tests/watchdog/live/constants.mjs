/**
 * Fixture data of the Watchdog live suite (cases.mjs): not product values. The product's names are
 * relayed from its contract (watchdog/src/constants.js, the connector's K2 naming), never imported.
 */
import path from 'node:path'
import { ENV } from '../../../../dsh-connector/tests/wire/constants.mjs'

const BUNDLE = Object.freeze({ name: 'dsh-connector-amenities', dir: path.resolve(import.meta.dirname, '..', '..', '..') })

export const WD = Object.freeze({
  /** The booted DSH links the real amenities bundle (its preset-watchdog and dsh-connector-watchdog rows). */
  env: Object.freeze({ [ENV.link]: JSON.stringify([BUNDLE]) }),
  scenario: Object.freeze({ main: 'wd-main', restart: 'wd-restart' }),
  row: 'dsh-connector-watchdog',
  presetRow: 'preset-watchdog',
  /** Public names: `<namespace>.<local>` with the bundle's namespace (K2). */
  tool: Object.freeze({
    brief: 'dsh-connector-amenities.watchdog_brief',
    refine: 'dsh-connector-amenities.watchdog_refine',
    pause: 'dsh-connector-amenities.watchdog_pause',
    resume: 'dsh-connector-amenities.watchdog_resume',
  }),
  driftType: 'contributed:dsh-connector-amenities.drift',
  delegate: 'watchdog',
  code: Object.freeze({ forbidden: 'forbidden', conflict: 'conflict', notBriefed: 'not-briefed', emptyPurpose: 'empty-purpose' }),
  during: Object.freeze({ permission: 'permission' }),
  /** The judge's answers the scripted model gives the side session (one per judgement). */
  answer: Object.freeze({
    allow: (reason) => [{ text: JSON.stringify({ verdict: 'allow', reason }) }],
    reject: (reason) => [{ text: JSON.stringify({ verdict: 'reject', reason }) }],
    pass: () => [{ text: JSON.stringify({ verdict: 'pass', reason: 'the manager decides' }) }],
    drifted: (reason) => [{ text: JSON.stringify({ verdict: 'drifted', reason }) }],
    nonsense: () => [{ text: 'I am not sure.' }],
  }),
  store: Object.freeze({ dir: 'dsh-connector-watchdog', file: 'briefs.json' }),
  purpose: (marker) => 'Fix the failing unit test in this folder. ' + marker,
  scope: 'Running fbtest_ask with any text.',
})
