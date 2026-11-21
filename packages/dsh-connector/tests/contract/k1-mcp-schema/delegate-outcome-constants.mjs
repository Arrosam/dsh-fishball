/**
 * DELEGATE-OUTCOME (the user, 2026-11-21, after the Watchdog live test), the K1 part. Values are
 * the requirement's words, never the implementation's: a permission offer's descriptor gains an
 * optional closed `delegate: {name, outcome: 'passed' | 'failed', reason?: string}`, present when a
 * claiming delegate passed or failed the request; DELEGATE_OUTCOME = {passed, failed}.
 */
export const DELEGATE_OUTCOME_CASES = Object.freeze({
  id: Object.freeze({ ep: 'DELEGATE-OUTCOME-EP-01', bva: 'DELEGATE-OUTCOME-BVA-01' }),
  permissionType: 'permission',
  outcomes: Object.freeze({ passed: 'passed', failed: 'failed' }),
})

/** A complete permission descriptor with no delegate field (fixture data). */
const BASE = Object.freeze({
  approvalId: 'apr_fbtest01', offerId: 'apr_fbtest01.r1', kind: 'approval', prompt: 'Allow bash?', choices: Object.freeze(['allow', 'reject']),
  title: 'DELEGATE-OUTCOME', at: 0, toolName: 'bash', callId: 'call_fbtest', reason: 'fbtest asks', quotes: Object.freeze([]),
  arguments: '{"command":"ls"}', argumentsStatus: 'complete',
})
const withDelegate = (delegate) => ({ ...BASE, delegate })

export const DELEGATE_PAYLOADS = Object.freeze({
  accepted: Object.freeze([
    ['no delegate (no delegate claimed it)', BASE],
    ['passed, no reason', withDelegate({ name: 'watchdog', outcome: 'passed' })],
    ['passed with a reason', withDelegate({ name: 'watchdog', outcome: 'passed', reason: 'the manager decides' })],
    ['failed with a code reason', withDelegate({ name: 'watchdog', outcome: 'failed', reason: 'judge-unreadable' })],
    ['failed, no reason', withDelegate({ name: 'watchdog', outcome: 'failed' })],
    ['failed with an empty reason string', withDelegate({ name: 'watchdog', outcome: 'failed', reason: '' })],
  ]),
  refused: Object.freeze([
    ['an outcome outside the vocabulary (allowed)', withDelegate({ name: 'watchdog', outcome: 'allowed' })],
    ['the verdict word pass as an outcome', withDelegate({ name: 'watchdog', outcome: 'pass' })],
    ['outcome missing', withDelegate({ name: 'watchdog' })],
    ['name missing', withDelegate({ outcome: 'passed' })],
    ['a non-string reason', withDelegate({ name: 'watchdog', outcome: 'failed', reason: 42 })],
    ['a non-string name', withDelegate({ name: 1, outcome: 'passed' })],
    ['an extra member (closed object)', withDelegate({ name: 'watchdog', outcome: 'passed', toolName: 'bash' })],
    ['delegate not an object', withDelegate('watchdog')],
    ['delegate null', withDelegate(null)],
  ]),
})
