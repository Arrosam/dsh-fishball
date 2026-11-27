/**
 * Vocabulary for the K3a cases: core's own copy of the MCP surface, the hosted-import names, Connect
 * and the fishball-ui seam (design `design/v3` 9a531192 §1.0b row 1, §1.0c, §6.3a; requirements
 * 1.38–1.41: R-ARCH-10, R-HOST-05 as amended by Q-G6 = A, R12 = B, R-FB-14, Q-G1, Q-G2 = A; the
 * user's decisions of 2026-11-16 on the reference and setting spellings).
 *
 * Every expected value comes from those requirements and decisions, or from the connector's
 * published values (K1 mcp-schema and K2 tools, vendored as fishball-test-helpers/connector-contract
 * since the connector left this repository, 6b7c53bf), never from core's implementation. Test inputs (sample origins, boundary strings) are fixture values, not product
 * values.
 */
import path from 'node:path'
import { SECRET_FIELD } from './k3-constants.mjs'

/** Core's package folder (this file is packages/core/tests/contracts/k3a-constants.mjs). */
export const CORE_DIR = path.join(import.meta.dirname, '..', '..')
/** The folder holding core's folder: where the DSH-side package folders used to sit beside it. */
const PACKAGES_DIR = path.dirname(CORE_DIR)

/** Core's own names (manifest name, the credential-record scope, the instance row it guards). */
export const NAMES = Object.freeze({ core: 'fishball-core', instance: 'dsh-instance' })

/** Files the cases read (core's own); the connector's published values are the vendored K1 / K2 modules. */
export const FILE = Object.freeze({
  coreContracts: path.join(CORE_DIR, 'contracts'),
  /** Core's bundle patch: a guard is a bare `{id, disabled: true}` row (the file's own rule). */
  corePatch: path.join(CORE_DIR, 'cordis.patch.yml'),
})
/**
 * Where `UI_SEAM` lives since F-UI: fishball-shared's `./ui-seam` export ("F-UI moves this object
 * unchanged into fishball-shared", core's own contract comment; F-UI interface item 7), because
 * fishball-ui loads without core and cannot import core's constants. Reached by name (core's dependency).
 */
export const UI_SEAM_SPECIFIER = 'fishball-shared/ui-seam'

/** R-ARCH-10 / 1.39 and design §1.0c: the DSH-side packages (names and their old package folders). */
export const DSH_SIDE = Object.freeze({
  names: Object.freeze(['dsh-agent-connector', 'dsh-connector-ui', NAMES.instance, 'dsh-connector-adapter', 'dsh-connector-shared']),
  folders: Object.freeze(['dsh-connector', 'dsh-connector-ui', 'dsh-instance', 'dsh-connector-adapter', 'dsh-connector-shared'].map((f) => path.join(PACKAGES_DIR, f))),
  /** Self-check of the specifier matcher (EP over the name rule): [specifier, is a DSH-side reference?]. */
  samples: Object.freeze([
    ['dsh-agent-connector', true],
    ['dsh-agent-connector/mcp-schema', true],
    ['dsh-connector-ui', true],
    ['dsh-instance/child', true],
    ['dsh-connector-adapter', true],
    ['dsh-connector-shared/redact', true],
    ['dsh-connectors', false],
    ['dsh-instance-child', false],
    ['fishball-shared', false],
    ['@deepseek-ai/dsh-credentials', false],
    ['./events', false],
  ]),
})

/** The core constants objects K3a adds (the relayed surface's export names); UI_SEAM moved to fishball-shared (F-UI). */
export const EXPORTS = Object.freeze(['MCP', 'LINK', 'HOSTED_IMPORT', 'CONNECT'])
/** The moved export and its new module's other exports' names are not this suite's: only UI_SEAM is. */
export const MOVED_EXPORT = 'UI_SEAM'

/** The relayed shape of `MCP` (keys only; values are checked against the connector). */
export const MCP_SHAPE = Object.freeze({
  paths: Object.freeze(['mcp', 'issuer', 'token', 'protectedResourcePrefix', 'authorizationServerPrefix', 'authorize']),
  events: Object.freeze(['name', 'uri', 'mimeType']),
  scope: Object.freeze(['full', 'pair']),
  /** core refusal key → [connector export, key]; `idInvalid` is the connector's ID_REFUSAL. */
  refusal: Object.freeze({
    alreadyPaired: ['REFUSAL', 'alreadyPaired'], idTaken: ['REFUSAL', 'idTaken'], idInvalid: ['ID_REFUSAL', 'idInvalid'],
    nameInvalid: ['REFUSAL', 'nameInvalid'], nameTaken: ['REFUSAL', 'nameTaken'], forbidden: ['REFUSAL', 'forbidden'],
    unsupportedOperation: ['REFUSAL', 'unsupportedOperation'], operationFailed: ['REFUSAL', 'operationFailed'],
    imagesUnsupported: ['REFUSAL', 'imagesUnsupported'], invalidArguments: ['REFUSAL', 'invalidArguments'],
    alreadySettled: ['REFUSAL', 'alreadySettled'], expired: ['REFUSAL', 'expired'],
  }),
  clientAuth: Object.freeze(['basic', 'none']),
  oauthError: Object.freeze(['invalidClient', 'invalidGrant', 'accessDenied']),
  name: Object.freeze(['minChars', 'maxChars', 'space', 'normalForm', 'namelessPrefix']),
  linkHttpStatus: Object.freeze(['unauthorized', 'forbidden', 'notFound']),
})

/** Design §1.0c neutral names (requirements 1.41 Q-G8 = B, Q-G9 = B). */
export const NEUTRAL = Object.freeze({
  mcp: '/api/agent/mcp',
  issuer: '/api/agent/oauth',
  token: '/api/agent/oauth/token',
  protectedResourceMetadata: '/.well-known/oauth-protected-resource/api/agent/mcp',
  authorizationServerMetadata: '/.well-known/oauth-authorization-server/api/agent/oauth',
  scopeFull: 'agent',
  scopePair: 'agent:pair',
  eventsName: 'agent-events',
  eventsUri: 'dsh-agent://events',
  agentIdParameter: 'agent_id',
  /** No DSH-side wire name says "fishball" any more (§1.0c: "every DSH-side name … is renamed"). */
  oldWord: /fishball/i,
})

/** The sample origins the published metadata is built for (fixture values; loopback per R-UI-02). */
export const SAMPLE = Object.freeze({
  origin: 'http://127.0.0.1:47321',
  approvalOrigin: 'http://127.0.0.1:47322',
})

/** BVA / EP inputs for the grammars core copies (fixture strings; the verdict is the connector's). */
const repeat = (n) => 'a'.repeat(n)
export const GRAMMAR_SAMPLES = Object.freeze({
  /** ID grammar: lengths 0, 1, 64, 65 and outside characters. */
  id: Object.freeze([['length 0', ''], ['length 1', 'a'], ['length 64', repeat(64)], ['length 65', repeat(65)], ['fb- prefix, digits, _ and -', 'fb-X_9'], ['a space', 'a b'], ['a dot', 'a.b']]),
  /** Local tool-name grammar: lengths 1, 48, 49; trailing / leading dot; upper case. */
  localName: Object.freeze([['length 1', 'a'], ['length 48', repeat(48)], ['length 49', repeat(49)], ['trailing dot', 'a.'], ['leading dot', '.a'], ['inner dot', 'a.b'], ['upper case', 'A']]),
  /** Name rules: a control (Cc), a format char (Cf), a plain letter; runs of white space. */
  control: Object.freeze([['Cc BEL', '\u0007'], ['Cf zero-width space', '\u200b'], ['plain letter', 'a']]),
  whitespaceRun: Object.freeze([['space and tab run', 'a \t b'], ['no-break space', 'a\u00a0b'], ['no white space', 'ab']]),
  /** Namespace characters: inside and outside the plugin-name alphabet. */
  outside: Object.freeze([['lower letter', 'a'], ['digit', '7'], ['hyphen', '-'], ['upper letter', 'A'], ['dot', '.'], ['at sign', '@']]),
})

/**
 * Hosted import (R-HOST-05 as amended by Q-G6 = A; the user's decisions 2026-11-16): the published
 * reference, child setting and saved record.
 */
export const HOSTED = Object.freeze({
  credentialRef: 'DSH_AGENT_TOKEN',
  /** The user's original spelling, which DSH's reference grammar refuses on both SDKs (the reason for the above). */
  refusedSpelling: 'dsh-agent-token',
  targetSetting: Object.freeze({ row: 'dsh-instance-child', field: 'targetUrl' }),
  savedRecord: Object.freeze({ key: 'fishball-core/hosted-agent', kind: 'grant' }),
  /** The row core's guard disables (design §5a.2; R-FB-12); the setting row must differ from it. */
  guardedInstanceRow: NAMES.instance,
  /** The credential record's scope is the owning plugin's registered name (DSH credentials docs). */
  recordScope: NAMES.core,
  /** The K3 guards contract names its guarded rows by this type (guards.d.ts, read as K3 does). */
  guardedRowType: 'GuardedRow',
  /** A bare guard row of the patch file: `- { id: <row>, disabled: true }`. */
  guardRow: /^-\s*\{\s*id:\s*([^,\s}]+)\s*,\s*disabled:\s*true\s*\}\s*$/gm,
})

/** DSH's credentials library of the current DSH (read only, never booted). */
export const CREDENTIALS = Object.freeze({
  pkg: 'dsh-credentials',
  types: path.join('lib', 'types'),
  /** The two presence reads core's rule uses (`describe(ref).configured || describeRecord(key).configured`). */
  presenceMethods: Object.freeze([/\babstract\s+describe\s*\(/, /\babstract\s+describeRecord\s*\(/]),
  presenceInfos: Object.freeze(['CredentialInfo', 'CredentialRecordInfo']),
  configuredField: 'configured',
})

/** Design §6.3a / R-OA-21 (R12 = B; decided items 11, 12): Connect. */
export const CONNECT_EXPECTED = Object.freeze({
  states: Object.freeze({ needsConfiguration: 'needs-configuration', needsAuthorization: 'needs-authorization', authorizing: 'authorizing', authorized: 'authorized', failed: 'failed' }),
  setting: 'connect.clientMetadataUrl',
  /** One code per failing rule (missing, not https, root path) plus not-a-connector and an insecure web callback. */
  configurationKeys: Object.freeze(['metadataUrlMissing', 'metadataUrlNotHttps', 'metadataUrlRootPath', 'notAConnector', 'webCallbackInsecure']),
  codeShape: /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/,
  loopbackPath: '/callback',
  pathStart: '/',
  /** A path starting with `//` is a protocol-relative URL naming another host, not a path. */
  protocolRelative: '//',
  /** R-OA-21 rule 4: the begin outcomes and the field each carries beside `outcome` (decision table). */
  begin: Object.freeze([
    Object.freeze({ outcome: 'authorized', fields: Object.freeze([]) }),
    Object.freeze({ outcome: 'approval-url', fields: Object.freeze(['url']), urlType: 'string' }),
    Object.freeze({ outcome: 'needs-configuration', fields: Object.freeze(['code']), codeVocabulary: true }),
  ]),
  outcomeField: 'outcome',
})

/** R-FB-14, 1.38 Q-N2, 1.41 Q-G1 / Q-G2 = A: the fishball-ui seam. */
export const UI = Object.freeze({
  member: 'ui',
  coreMissing: 'fishball-core-missing',
  instance: 'fishballInstance',
  /** `FishballUi` members and their arities (the relayed surface). */
  top: Object.freeze({ managerSessionId: Object.freeze({ params: 0 }) }),
  /**
   * Re-baselined by MULTI-0 (core contracts README "MULTI-0 amendment", ui.d.ts, targets.d.ts):
   * the scalar `link`, `connect` and `pairing` groups are withdrawn for `targets` (FishballTargets),
   * whose actions each name a `targetId` first, except `add(url)`.
   */
  groups: Object.freeze({
    targets: Object.freeze({
      list: Object.freeze({ params: 0 }),
      onChange: Object.freeze({ params: 1 }),
      add: Object.freeze({ params: 1 }),
      remove: Object.freeze({ params: 2, optionalFrom: 1 }),
      setUrl: Object.freeze({ params: 3, optionalFrom: 2 }),
      begin: Object.freeze({ params: 1 }),
      cancel: Object.freeze({ params: 1 }),
      retry: Object.freeze({ params: 1 }),
      choose: Object.freeze({ params: 3, optionalFrom: 2 }),
    }),
    guards: Object.freeze({ report: Object.freeze({ params: 0 }), onChange: Object.freeze({ params: 1 }) }),
    asks: Object.freeze({ list: Object.freeze({ params: 0 }), onChange: Object.freeze({ params: 1 }), answer: Object.freeze({ params: 2 }) }),
  }),
  onChange: 'onChange',
  /** `FishballConnect` (connect.d.ts, still declared): the client's status, onChange, begin, cancel. */
  fishballConnect: Object.freeze(['status', 'onChange', 'begin', 'cancel']),
  /** MULTI-0: the withdrawn scalar members of `FishballUi`, and the target selector each `targets` action names first. */
  withdrawn: Object.freeze(['link', 'connect', 'pairing']),
  targetsGroup: 'targets',
  targetIdParam: Object.freeze({ name: 'targetId', type: 'TargetId', methods: Object.freeze(['remove', 'setUrl', 'begin', 'cancel', 'retry', 'choose']) }),
  /** MULTI-0: `ui.asks.answer(handle, answer)`: the card's opaque handle, never a raw approvalId. */
  answer: Object.freeze({ group: 'asks', method: 'answer', first: 'handle', firstType: 'string' }),
  /** K3's secret-name test plus the OAuth secrets (bearer, PKCE verifier). */
  secretField: new RegExp(SECRET_FIELD.source + '|bearer|verifier', 'i'),
  /** The provider that hands tokens to an MCP client; fishball-ui must not get it. */
  tokenCarrier: 'authProvider',
  walkDepth: 6,
  /** Self-check of the secret-name detector (EP): names caught, names not caught. */
  secretSamples: Object.freeze(['token', 'accessToken', 'refreshToken', 'credential', 'codeVerifier', 'authProvider']),
  plainSamples: Object.freeze(['state', 'url', 'code']),
})

/** The HostedImportNames member names (the relayed surface), and the SDK's record union. */
export const HOSTED_FIELDS = Object.freeze({
  credentialRef: 'credentialRef', targetSetting: 'targetSetting', savedRecord: 'savedRecord',
  row: 'row', field: 'field', key: 'key', kind: 'kind',
  sdkRecordUnion: 'CredentialRecord',
})

/** Type-text shapes. */
export const TYPE_TEXT = Object.freeze({
  promise: /^Promise\s*</,
  noFlags: '',
  urlField: 'url',
  codeField: 'code',
})

/** The declared types the relayed surface names (`.d.ts` in core contracts). */
export const TYPES = Object.freeze({
  linkState: 'LinkState',
  linkCode: 'LinkCode',
  connectState: 'ConnectState',
  connectConfigurationCode: 'ConnectConfigurationCode',
  connectBegin: 'ConnectBegin',
  oauthClient: 'OAuthClient',
  hostedImportNames: 'HostedImportNames',
  fishballUi: 'FishballUi',
  fishballConnect: 'FishballConnect',
  nullType: 'null',
  /** `Pick<T, 'a' | 'b'>` / `Omit<…>`: the K3 reader does not follow these utility types. */
  utility: /^(Pick|Omit)\s*<\s*([A-Za-z_$][\w$.]*)\s*,([\s\S]*)>$/,
  pick: 'Pick',
})

/** OAuthClient (design §6.3a; the S7c token manager): members and arities. */
export const OAUTH_CLIENT = Object.freeze({
  provider: 'authProvider',
  methods: Object.freeze({ status: Object.freeze({ params: 0 }), onChange: Object.freeze({ params: 1 }), begin: Object.freeze({ params: 0 }), cancel: Object.freeze({ params: 0 }), forget: Object.freeze({ params: 0 }) }),
  asynchronous: Object.freeze(['begin']),
})

