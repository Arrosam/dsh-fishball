/**
 * Vocabulary for the C-TOKENS-REVEAL cases (v3-w4-briefs.md "C-TOKENS-REVEAL"; design §5.1–§5.3,
 * §5.6, §5.9 read with §1.0c; requirements 1.27–1.29, R-TOK-03/04/06/08/09/11, R-OA-03/06):
 * AUTH-UC-01 (rewritten), AUTH-UC-15, AUTH-EP-04 rows 1 and 8, AUTH-DT-05 rows 1–2 and 5,
 * AUTH-DT-13, AUTH-ST-01 (no Unconfigured state). See USE-CASES.md.
 *
 * Product values come from the K1d freeze `dsh-agent-connector/mcp-schema` (TOKEN_VALUE, ENTRY_STATUS,
 * SETTINGS_REFUSAL, REVOCATION_KIND), from the design (the storage domain name, §1.0c) and from K3
 * `host-services/tokens.d.ts` (the hosted label). The module's own layout (SUBJECT) is the surface
 * the dev session relayed, the public contract the cases bind to (subject.mjs). The rest is
 * fixture data and harness timing, which are not product values.
 */
import path from 'node:path'
import { ENTRY_STATUS, REVOCATION_KIND, SETTINGS_REFUSAL, TOKEN_VALUE } from '../../mcp-schema/index.js'
import { REPO } from '../../../../test/support/constants.mjs'

export { ENTRY_STATUS, REVOCATION_KIND, SETTINGS_REFUSAL, TOKEN_VALUE }

const CONNECTOR = path.join(REPO, 'packages', 'dsh-connector')

/**
 * The relayed surface of `packages/dsh-connector/src/tokens/index.js` (2026-11-16).
 * FBTEST_C_TOKENS_ENTRY moves the entry (another checkout).
 */
export const SUBJECT = Object.freeze({
  entry: process.env.FBTEST_C_TOKENS_ENTRY ?? path.join(CONNECTOR, 'src', 'tokens', 'index.js'),
  factory: 'createTokenRegistry',
  findDuplicates: 'findDuplicates',
  generate: 'generateTokenValue',
  /** `apply`'s reason vocabulary (`{start, settings}`): an input word, read from the module. */
  syncReason: 'SYNC_REASON',
  members: Object.freeze(['apply', 'create', 'createHosted', 'match', 'get', 'list', 'onRevoked', 'notice', 'close']),
  /** `create` rejects a failed write with this `code` (TokenCreateError; K3 CreateHostedErrorCode). */
  operationFailed: 'operation-failed',
})

/**
 * The entries' digest records. The domain name is the design's (§1.0c `dsh_connector_tokens`); the
 * version, table and per-record layout are the relayed surface ("a store left at version 1 is
 * opened fresh"), used only to read the records back and to stage hand-edited stores.
 */
export const STORE = Object.freeze({
  domain: 'dsh_connector_tokens',
  table: 'entries',
  version: 2,
  /** A W2 development build's store (relayed: opened fresh, nothing authenticates from it). */
  oldVersion: 1,
  layout: 'per-record',
  /** The record field holding the hex digest of the value (relayed record shape). */
  digestField: 'digest',
  digestEncoding: 'hex',
  /** The record field marking a record removed (relayed record shape). */
  removedField: 'removed',
})

/** K3 host-services/tokens.d.ts HostedTokenEntry.label: the hosted entry's label. */
export const HOSTED_LABEL = 'Fishball (hosted)'

/**
 * R-TOK-08 asks for "at least 256 bits"; K1 freezes the bytes (TOKEN_VALUE.generatedBytes), not the
 * floor, so the floor is the requirement's own number.
 */
export const REQUIREMENT = Object.freeze({ minEntropyBits: 256, bitsPerByte: 8, base64BitsPerChar: 6 })
const BODY_CHARS = Math.ceil(TOKEN_VALUE.generatedBytes * REQUIREMENT.bitsPerByte / REQUIREMENT.base64BitsPerChar)
/** A whole generated value: `dsht_` + 43 base64url characters (design §5.2, §1.0c). */
export const VALUE_PATTERN = new RegExp(`^${TOKEN_VALUE.generatedPrefix}[A-Za-z0-9_-]{${BODY_CHARS}}$`)
/** A generated-looking value anywhere in a text (leak sweeps where the value is unknown). */
export const VALUE_ANYWHERE = new RegExp(`${TOKEN_VALUE.generatedPrefix}[A-Za-z0-9_-]{${BODY_CHARS}}`)
/** Registry members that would show, return or change a value after creation (R-TOK-09, R-TOK-11: none exist). */
export const NO_SUCH_MEMBER = /reveal|regenerat|replace|rotate|secret|(?:get|set|show|read|edit|change|resolve)(?:Token)?Value/i
/** Fields a registry answer never carries (K1d TokenEntry: never a value, digest or reference). */
export const SECRET_FIELDS = Object.freeze(['value', 'digest', 'ref', 'fingerprint', 'secret'])

/** DSH's own vocabulary (installed SDK; the same on both). */
export const DSH = Object.freeze({
  cordis: '@deepseek-ai/cordis',
  credentialsLocal: '@deepseek-ai/dsh-credentials-local',
  launchEnvironment: '@deepseek-ai/dsh-launch-environment',
  storage: '@deepseek-ai/dsh-storage',
  storageJson: '@deepseek-ai/dsh-storage-json',
  storageDomain: '@deepseek-ai/dsh-storage-domain',
  backend: 'json',
  /** dsh-launch-environment's inherited-environment layer. */
  processLayer: 'process',
  /** cordis LoggerLevel.DEBUG: the exporter takes every level, so nothing the registry logs is missed. */
  allLevels: 3,
  /** A runtime package DSH ships outside the @deepseek-ai scope (record schemas). */
  zod: 'zod',
  packageFile: 'package.json',
})

/** Fixture data: not product values. */
export const FIXTURE = Object.freeze({
  tempPrefix: 'fbtest-c-tokens-',
  domainDir: 'domain',
  labelA: 'Agent A',
  labelB: 'Agent B',
  labelC: 'Agent C',
  /** A hand-made copy of A's item (same key) in a hand-edited settings document. */
  labelCopy: 'Agent A (copy)',
  /** A hand-added item: never created by New token, so no record exists for its key. */
  handLabel: 'Typed by hand',
  handKey: 'fbtest-hand-added-key',
  renamed: 'Agent A on the laptop',
  /** AUTH-UC-01 E3 / BVA: the label partitions (blank, padded, shortest). */
  padded: '  Agent A  ',
  shortest: 'A',
  blanks: Object.freeze(['', '   ', '\t\n']),
  nonStrings: Object.freeze([undefined, null, 42, true, Object.freeze({ label: 'Agent A' }), Object.freeze(['Agent A'])]),
  /** AUTH-EP-04 row 8. */
  manyEntries: 10,
  manyLabelPrefix: 'Agent ',
  /** The K3 caller's instance id is not this module's business; createHosted takes none (relayed). */
  failedSave: 'fbtest: the settings save failed',
})

/** Harness timing (ms): not product values. */
export const WAIT = Object.freeze({
  eventuallyMs: 5000,
  pollMs: 20,
  quietMs: 300,
  testMs: 30000,
})

/** Rows that need a later task or another level: each names the owner. */
export const LATER = Object.freeze({
  surfaces: 'C-WIRE (the wired connector: settings read-back, every browser response and DSH UI grepped for the value)',
  tokenEndpoint: 'C-WIRE (C-OAUTH\'s token endpoint over this registry: invalid_client for a disabled, deleted, duplicated or record-less entry)',
  accessTokens: 'C-WIRE (C-OAUTH\'s access tokens invalidated through onRevoked and the entry generation)',
  hostedChild: 'I-HOST (the hosted value stored in the child\'s credential store only, and left there dead after a delete; no hosted child is launched here)',
  formStatus: 'C-WIRE (the read-only pair columns of each entry on the connector\'s page; R-ID-12)',
  timing: 'code review (constant-time compare is not observable black-box without a flaky timing test)',
})
