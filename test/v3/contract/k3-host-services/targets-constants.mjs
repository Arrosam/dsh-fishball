/**
 * Oracles for the K3 MULTI-0 rows (2026-11-18): core's `targets.d.ts` and the declarations it
 * changed (`index.d.ts`, `ask-card.d.ts`, `events.d.ts`, `ui.d.ts`, `link.d.ts`) and K3's
 * `child.d.ts`. Sources: packages/core/contracts/README.md "MULTI-0 amendment (K3/K3a,
 * 2026-11-18)", PLAN-MULTI §3.3, §5, §7; the contract files as the published interface. The
 * runtime-value agreement (unions vs `SEAM_TARGETS`) is the K3a suite's, which reads fishball-shared.
 */
import path from 'node:path'
import { FOLDER } from './constants.mjs'

/** The file and its re-export from index.d.ts. */
export const TARGETS_FILE = Object.freeze({
  file: 'targets.d.ts',
  index: 'index.d.ts',
  /** `export type { … } from './targets.js'` in index.d.ts. */
  reExport: /export\s+type\s*\{([^}]*)\}\s*from\s*['"]\.\/targets\.js['"]/,
  /** A top-level exported declaration of targets.d.ts. */
  declared: /^export\s+(?:type|interface)\s+([A-Za-z_$][\w$]*)/gm,
})

/** The names index.d.ts exports from targets.d.ts (the K3 brief and index.d.ts's MULTI-0 note). */
export const TARGETS_EXPORTS = Object.freeze([
  'TargetId', 'EndpointEpoch', 'TargetKind', 'TargetState', 'TargetIdentityState', 'TargetSource', 'TargetRecord', 'TargetView',
  'TargetsSnapshot', 'TargetActionResult', 'FishballTargets', 'FishballTargetBound', 'SetStatus', 'StatusSnapshot',
])

/** README "Target record" and "Provenance" rows; targets.d.ts TargetView. */
const SOURCE = Object.freeze(['targetId', 'endpointEpoch', 'serverName', 'name'])
export const MEMBERS = Object.freeze({
  TargetSource: SOURCE,
  TargetRecord: Object.freeze(['id', 'kind', 'url', 'endpointEpoch', 'order', 'serverName', 'duplicateSuffix']),
  /** TargetView extends TargetSource; `url` in details only, no credential (Q01, §3.1). */
  TargetView: Object.freeze([...SOURCE, 'kind', 'url', 'order', 'duplicateSuffix', 'state', 'connecting', 'link', 'connect', 'control', 'line',
    'pairing', 'identity', 'contributedTools', 'removable', 'urlEditable']),
  /** README "List / status API": list, onChange, add, remove, setUrl, begin, cancel, retry, choose. */
  FishballTargets: Object.freeze(['list', 'onChange', 'add', 'remove', 'setUrl', 'begin', 'cancel', 'retry', 'choose']),
  TargetsSnapshot: Object.freeze(['version', 'targets']),
})
/** Nullable provenance and allocation fields (Q01: `null` before discovery; `duplicateSuffix` `null` or n). */
export const NULLABLE = Object.freeze({
  TargetSource: Object.freeze(['serverName', 'name']),
  TargetRecord: Object.freeze(['serverName', 'duplicateSuffix']),
})
/** README "Per-target strip": `TargetView.line {kind: string, code: string | null}` (MULTI-3's amendment). */
export const LINE = Object.freeze({
  view: 'TargetView', member: 'line',
  fields: Object.freeze({ kind: Object.freeze({ type: 'string', nullable: false }), code: Object.freeze({ type: 'string', nullable: true }) }),
})
/** TargetsSnapshot.version is the literal 1 (README "List / status API"). */
export const SNAPSHOT_VERSION = '1'
/** The declarations the rows read by name. */
export const TYPES = Object.freeze({
  snapshot: 'TargetsSnapshot', version: 'version', nullLeaf: 'null', interfaceKind: 'interface',
  noSecret: Object.freeze(['TargetRecord', 'TargetView', 'TargetSource']),
})
/**
 * README "Status snapshot" and targets.d.ts: `StatusSnapshot` is `{fishball: 'on', targets:
 * TargetsSnapshot, guards: GuardReport | null, set: SetStatus | null}` or exactly `{fishball:
 * 'fishball-off'}` (no `targets`); `SetStatus` is `{status, missing[]}`, each missing `{name, reason, code}`.
 */
export const STATUS = Object.freeze({
  type: 'StatusSnapshot',
  discriminant: 'fishball',
  branches: Object.freeze({
    on: Object.freeze({ targets: Object.freeze(['TargetsSnapshot']), guards: Object.freeze(['GuardReport', 'null']), set: Object.freeze(['SetStatus', 'null']) }),
    'fishball-off': Object.freeze({}),
  }),
  set: Object.freeze({
    type: 'SetStatus',
    members: Object.freeze(['status', 'missing']),
    status: Object.freeze(['ok', 'plugin-set-incomplete']),
    entry: Object.freeze({ name: Object.freeze(['string']), reason: Object.freeze(['skipped', 'failed']), code: Object.freeze(['string', 'null']) }),
  }),
  /** The K3a scalar members withdrawn from the snapshot (README "List / status API"). */
  withdrawn: Object.freeze(['link', 'connect', 'line', 'control', 'contributedTools']),
})
/** No member reachable from a target is a token or credential (README "no token value"; §3.1). */
export const SECRET_MEMBER = /token|secret|credential|grant|password|verifier|bearer/i

/** README "Target-bound seams": bridge(pluginId, ops, {targetId}), attention.signal(pluginId, input, {targetId}); apiVersion 2. */
export const BOUND = Object.freeze({
  type: 'FishballTargetBound',
  instanceType: 'FishballInstance',
  apiVersion: Object.freeze({ member: 'apiVersion', value: '2' }),
  bridge: Object.freeze({ name: 'bridge', params: 3 }),
  attention: Object.freeze({ member: 'attention', method: 'signal', params: 3 }),
  targetField: 'targetId',
  targetIdType: 'TargetId',
})

/** README "Provenance" and "Ask handle": AskCard.handle, AskCard.source, state `voided`; InterceptedEvent.source. */
export const PROVENANCE = Object.freeze({
  askCard: 'AskCard',
  event: 'InterceptedEvent',
  sourceField: 'source',
  sourceType: 'TargetSource',
  handleField: 'handle',
  stateField: 'state',
  /** The K3 card states before MULTI-0 plus `voided` (Q07). */
  askStates: Object.freeze(['open', 'answered', 'closed', 'voided']),
  stringType: 'string',
})

/** K3 child.d.ts / README: `target-remote` withdrawn with the remote override (PLAN-MULTI §3.3). */
export const WITHDRAWN_REMOTE = Object.freeze({
  code: 'target-remote',
  refusalType: 'ReconnectRefusalCode',
  refusals: Object.freeze(['not-ready', 'connector-missing', 'operation-failed', 'credentials-unwritable']),
  readme: path.join(FOLDER.hostServices, 'README.md'),
  /** A README table row naming reconnect(). */
  reconnectRow: /^\|\s*`reconnect\(\)`/,
  /** A clause that names the code only as withdrawn. */
  withdrawnWord: /withdrawn/i,
  clause: /[;|]/,
})

/** link.d.ts states the hosted reservation (README "Hosted reservation"; PLAN-MULTI §3.3). */
export const RESERVATION = Object.freeze({
  file: 'link.d.ts',
  words: Object.freeze([/MULTI-0/, /TARGETS\.parentId/, /`parent`/, /read-only/, /not removable/, /`target-reserved`/, /`credentialRef`/,
    /`savedRecord`/, /pending-origin/, /parent alone/, /never reads, writes or unsets/, /remote-target override is withdrawn/]),
})
