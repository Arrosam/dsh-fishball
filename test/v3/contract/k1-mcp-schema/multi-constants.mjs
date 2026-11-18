/**
 * Oracles for the K1 MULTI-0 rows (2026-11-18): the additive server-identity contract of
 * `dsh-agent-connector/mcp-schema`. Sources: packages/dsh-connector/mcp-schema/README.md "MULTI-0
 * amendment (2026-11-18): server identity", PLAN-MULTI (docs/planning/v3-multi-dsh.md) D04–D08,
 * §4.1, §4.3, §7 "Identity push" and "Wire", Q02. Spec-defined shapes (the serverInfo `_meta` key,
 * the resource-updated notification, `Implementation`) come from each SDK's own MCP packages.
 */
import path from 'node:path'

/** README: `RESOURCE.identity` is `dsh-identity`, `dsh-agent://identity`, `application/json`. */
export const IDENTITY_RESOURCE = Object.freeze({ name: 'dsh-identity', uri: 'dsh-agent://identity', mimeType: 'application/json' })
/** "no tool, schema, OAuth, receipt or event changes": the events resource stays as K1 froze it (R-EVS-01). */
export const EVENTS_RESOURCE = Object.freeze({ name: 'agent-events', uri: 'dsh-agent://events', mimeType: 'application/json' })
/** The resource keys after MULTI-0: exactly events and the additive identity. */
export const RESOURCE_KEYS = Object.freeze(['events', 'identity'])

/** README: `-DSH` appended once; carried at `_meta['io.modelcontextprotocol/serverInfo']`; pushed by `notifications/resources/updated`. */
export const SERVER_IDENTITY_VALUES = Object.freeze({
  suffix: '-DSH',
  discoverMetaKey: 'io.modelcontextprotocol/serverInfo',
  updatedNotification: 'notifications/resources/updated',
})

/** README "resources/read returns … exactly the MCP Implementation {name, version} (`ServerIdentity`)". */
export const SERVER_IDENTITY_TYPE = Object.freeze({
  name: 'ServerIdentity',
  members: Object.freeze({ name: 'string', version: 'string' }),
})

/** The runtime export names this amendment adds, and the index.js header list that must name them. */
export const MULTI_EXPORTS = Object.freeze({
  resource: 'RESOURCE',
  resourceKeys: Object.freeze({ events: 'events', identity: 'identity' }),
  serverIdentity: 'SERVER_IDENTITY',
  indexFile: path.join('packages', 'dsh-connector', 'mcp-schema', 'index.js'),
  /** index.js's "Frozen export names" header: the constants.js line list. */
  headerList: /constants\.js:([\s\S]*?);\s*\n\s*\*\s*-\s*tools\.js:/,
})

/**
 * "no tool … changes" (README; PLAN-MULTI §7 "Wire": existing Connector tool schemas and raw names
 * unchanged, no `dsh` field): TOOL_NAMES as at the freeze base e02ee05e, before MULTI-0.
 */
export const TOOL_NAMES_UNCHANGED = Object.freeze([
  'sessions_list', 'session_start', 'session_message', 'session_redirect', 'session_stop', 'session_read', 'session_release',
  'approvals_list', 'approval_answer', 'question_answer', 'question_ask', 'question_answer_own', 'prompts_list', 'prompt_answer',
  'grants_list', 'grant_revoke', 'attachment_put', 'attachment_read', 'inbox_poll', 'inbox_ack', 'pair', 'set_name',
])
/** D01: no MCP tool gains a target-selecting argument. */
export const NO_TARGET_ARGUMENT = /^(?:dsh|target|targetId|server)$/

/** The SDK's MCP client entry exports the serverInfo `_meta` key; its core entry the notification and Implementation schemas. */
export const SDK_ORACLE = Object.freeze({
  metaKeyExport: 'SERVER_INFO_META_KEY',
  notificationSchema: 'ResourceUpdatedNotificationSchema',
  serverNotifications: 'ServerNotificationSchema',
  implementationSchema: 'ImplementationSchema',
  /**
   * The notification's one required parameter (README: `{uri}` "and no param beyond the SDK's own
   * `_meta`", its listen subscription id, stamped by the SDK under the client's meta key below).
   */
  uriParam: 'uri',
  metaParam: '_meta',
  subscriptionMetaKey: 'SUBSCRIPTION_ID_META_KEY',
  /** A fixture subscription id (test input). */
  subscriptionId: 'fbtest-subscription',
})

/** README section and the words it must carry (exact frozen values and the rule's parts). */
export const MULTI_README = Object.freeze({
  section: '## MULTI-0 amendment (2026-11-18): server identity',
  words: Object.freeze([
    /`RESOURCE\.identity`/, /`dsh-identity`/, /`dsh-agent:\/\/identity`/, /`application\/json`/, /`SERVER_IDENTITY`/,
    /approval\.dshName/, /node:os\.hostname\(\)/, /`-DSH`/, /appended once/, /io\.modelcontextprotocol\/serverInfo/,
    /notifications\/resources\/updated/, /no param beyond the SDK's own `_meta`/, /no\s+tool, schema, OAuth, receipt or event changes/, /unchanged name sends nothing/,
    /No Host\/Origin\/URL-derived name/,
  ]),
})

/** Behaviour behind the values: MULTI-2 builds it (PLAN-MULTI §8 MULTI-2 suites). */
export const MULTI_LATER = Object.freeze({
  connector: 'MULTI-2 (dsh-connector.mcp-http / .wire: live serverInfo name, identity resource read, resources/updated push)',
  rows: Object.freeze([
    'serverInfo.name is approval.dshName verbatim (non-blank) or os.hostname(), plus -DSH once, no title',
    'resources/read dsh-agent://identity returns one JSON text content equal to the discovered {name, version}',
    'a changed effective name sends notifications/resources/updated {uri: identity} to subscribed authenticated listen streams only; an unchanged one sends nothing',
  ]),
})
