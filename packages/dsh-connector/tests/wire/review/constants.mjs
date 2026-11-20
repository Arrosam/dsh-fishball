/** Requirement/contract vocabulary only. No connector implementation is imported by these cases. */
// K1 owns these vocabularies since C-WIRE-2 (the V2 ./contract export is gone; LIMITS is K1 PAYLOAD_LIMITS).
import { APPROVAL_DECISION as DECISION, DELIVERY, PAYLOAD_LIMITS as LIMITS, RISK } from '../../../mcp-schema/index.js'
import { BUDGET, FIXTURE, HTTP, K1, SURFACE } from '../constants.mjs'
import { LIST_ACTIVITY } from '../../../../../test/support/session-list-activity-data.mjs'

export { BUDGET, DECISION, DELIVERY, FIXTURE, HTTP, K1, LIMITS, RISK, SURFACE }

/** Test-owned IPC vocabulary agreed with the parent, who alone owns world.mjs / worker.mjs. */
export const OP = Object.freeze({
  row: 'row', services: 'services', logs: 'logs', bundleEnabled: 'bundleEnabled',
  settingsMutate: 'settingsMutate', settingsUpdate: 'settingsUpdate', raceHostedUserSave: 'raceHostedUserSave',
  createSession: 'createSession', userDrive: 'userDrive', session: 'session', waitIdle: 'waitIdle', activity: 'activity',
  requestTools: 'requestTools',
})

/** The two exact K1 sentences are independent public-contract oracles, not implementation text. */
export const DESCRIPTION = Object.freeze({
  [K1.TOOL.sessionRead]: 'Read the latest messages of a session you manage, within the given bounds.',
  [K1.TOOL.sessionsList]: 'List the main-DSH sessions you manage. Sessions nobody manages and sessions another principal manages are omitted.',
})

/** Named requirement facts not exported by K1; no numeric product limit is restated here. */
export const EXPECT = Object.freeze({
  portZero: SURFACE.settings.portMin,
  activityEvent: LIST_ACTIVITY.event,
  textBlock: 'text',
  oneTextBlock: 1,
  userMessageEvent: 'user/message',
  idle: 'idle',
})

/** Values only identify disposable fixtures and scenarios, never product behavior. */
export const DATA = Object.freeze({
  scenario: Object.freeze({ noCap: 'review-c-wire-2', b1: 'review-b1', b2: 'review-b2', access: 'review-access', noWeb: 'review-no-web', port: 'review-port-zero', race: 'review-own-write-race' }),
  id: 'wire-review-agent', folder: 'wire-review-session', promptId: 'wire-review-unmanaged-prompt',
  label: 'Review principal', copyLabel: 'Review duplicate copy', hostedInstance: 'wire-review-hosted-instance',
  message: 'Review principal delivery remains visible', userText: 'Review user message establishes recent activity',
  read: Object.freeze({ maxMessages: 8, maxBytes: 4096 }),
})

export const V3_SERVICES = Object.freeze([
  SURFACE.service.handover, SURFACE.service.tools, SURFACE.service.tokens, SURFACE.service.ui,
])

export const SCHEMA_TEXT = Object.freeze({
  // K1's MCP endpoint is POST-only. The resource's GET metadata route is a different route.
  protectedResource: K1.PATHS.protectedResourcePrefix + K1.PATHS.mcp,
  authorizationServer: K1.PATHS.authorizationServerPrefix + K1.PATHS.issuer,
})

/**
 * The two C-WIRE-2 rows (the user's decisions, 2026-11-16/17): no cap on pending approvals, and the
 * deleted main-session tools. V2's maxPendingApprovals default was 8 (test/support LIMITS).
 */
export const FUTURE = Object.freeze({
  v2Cap: 8,
  noCapCount: 10,
  capField: 'maxPendingApprovals',
  messageTool: 'message_agent',
  deletedTools: Object.freeze(['list_user_messages', 'ask_agent']),
})
