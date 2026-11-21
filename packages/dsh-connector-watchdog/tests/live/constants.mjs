/**
 * Fixture data of the Watchdog live suite (cases.mjs): not product values. The product's names are
 * relayed from its contract (watchdog/src/constants.js, the connector's K2 naming), never imported.
 */
import path from 'node:path'
import { ENV } from '../../../dsh-connector/tests/wire/constants.mjs'

/** The real dsh-connector-watchdog package, linked on its own (it is its own bundle). */
const BUNDLE = Object.freeze({ name: 'dsh-connector-watchdog', dir: path.resolve(import.meta.dirname, '..', '..') })

export const WD = Object.freeze({
  /** The booted DSH links the real watchdog bundle (its preset-watchdog and dsh-connector-watchdog rows). */
  env: Object.freeze({ [ENV.link]: JSON.stringify([BUNDLE]) }),
  scenario: Object.freeze({ main: 'wd-main', restart: 'wd-restart' }),
  row: 'dsh-connector-watchdog',
  presetRow: 'preset-watchdog',
  /** Public names: `<namespace>.<local>` with the bundle's namespace (K2). */
  tool: Object.freeze({
    brief: 'dsh-connector-watchdog.watchdog_brief',
    refine: 'dsh-connector-watchdog.watchdog_refine',
    pause: 'dsh-connector-watchdog.watchdog_pause',
    resume: 'dsh-connector-watchdog.watchdog_resume',
  }),
  driftType: 'contributed:dsh-connector-watchdog.drift',
  delegate: 'watchdog',
  code: Object.freeze({ forbidden: 'forbidden', conflict: 'conflict', notBriefed: 'not-briefed', emptyPurpose: 'empty-purpose' }),
  during: Object.freeze({ permission: 'permission' }),
  /** The judge's answers the scripted model gives the side session (one per judgement). */
  answer: Object.freeze({
    allow: (reason) => [{ text: JSON.stringify({ verdict: 'allow', reason }) }],
    reject: (reason) => [{ text: JSON.stringify({ verdict: 'reject', reason }) }],
    pass: () => [{ text: JSON.stringify({ verdict: 'pass', reason: 'the manager decides' }) }],
    unknown: () => [{ text: JSON.stringify({ verdict: 'maybe', reason: 'not sure' }) }],
    drifted: (reason) => [{ text: JSON.stringify({ verdict: 'drifted', reason }) }],
    nonsense: () => [{ text: 'I am not sure.' }],
  }),
  /** The pass answer's reason, as the offer's delegate.reason must carry it. */
  passReason: 'the manager decides',
  /** The offer's delegate outcome words (K1 DELEGATE_OUTCOME) and Watchdog's JUDGE_FAILURE codes (the user, 2026-11-21). */
  outcome: Object.freeze({ passed: 'passed', failed: 'failed' }),
  failure: Object.freeze({ timeout: 'judge-timeout', noAnswer: 'judge-no-answer', unreadable: 'judge-unreadable', failed: 'judge-failed' }),
  /** A drift stop as the manager's turn-finished reports it (DSH's hook cause with TEXT.drift). */
  turn: Object.freeze({
    stopped: 'stopped', aborted: 'aborted',
    driftStopPrefix: 'the turn was cancelled (hook: Watchdog stopped the session (permission): ',
    driftStop: (reason) => `the turn was cancelled (hook: Watchdog stopped the session (permission): ${reason})`,
  }),
  store: Object.freeze({ dir: 'dsh-connector-watchdog', file: 'briefs.json' }),
  purpose: (marker) => 'Fix the failing unit test in this folder. ' + marker,
  scope: 'Running fbtest_ask with any text.',
})
