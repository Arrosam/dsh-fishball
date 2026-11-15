/**
 * Vocabulary for the C-TOKENS cases (v3-tasks.md row C-TOKENS, wave W2; docs/test-design/v3/
 * 01-auth-pairing.md): AUTH-UC-01, AUTH-EP-04, AUTH-BVA-03, AUTH-DT-05, AUTH-ST-01 rows 1, 5–10, 10a–10m (Q5 = B), 12.
 *
 * Every product value comes from the K1 freeze `dsh-connector/mcp-schema`, never from an
 * implementation: the token-value rules (TOKEN_VALUE), the entry statuses (ENTRY_STATUS), the
 * settings refusals (SETTINGS_REFUSAL) and, from its declaration file (types only), the
 * `RevocationKind` words of `TokenRegistry.onRevoked`. DSH's own names (packages, the process
 * environment layer, the credential event) are the installed SDK's. The rest is fixture data and
 * harness timing, which are not product values.
 */
import fs from 'node:fs'
import path from 'node:path'
import { ENTRY_STATUS, SETTINGS_REFUSAL, TOKEN_VALUE } from '../../../packages/dsh-connector/mcp-schema/index.js'
import { REPO } from '../../support/constants.mjs'

export { ENTRY_STATUS, SETTINGS_REFUSAL, TOKEN_VALUE }

/** The C-TOKENS "Owns" folder. FBTEST_C_TOKENS_ENTRY moves the entry (another checkout). */
export const SUBJECT = Object.freeze({
  entry: process.env.FBTEST_C_TOKENS_ENTRY ?? path.join(REPO, 'packages', 'dsh-connector', 'src', 'tokens', 'index.js'),
  /** K1 freezes the `TokenRegistry` interface but no factory: the one export found by meaning. */
  factoryName: /^(?:open|create)\w*Token/i,
  /** `apply`'s reason for the connector-start sync (not a settings save; subject.mjs). */
  startReason: 'start',
})

/** K1's declaration file: `RevocationKind` is a type there, so its words are read from the text. */
const K1_DTS = path.join(REPO, 'packages', 'dsh-connector', 'mcp-schema', 'index.d.ts')
const revocationKinds = () => {
  const m = /export type RevocationKind\s*=\s*([^\n]+)/.exec(fs.readFileSync(K1_DTS, 'utf8'))
  if (!m) throw new Error('K1 index.d.ts declares no RevocationKind')
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}
const kind = (stem) => {
  const found = revocationKinds().find((k) => k.startsWith(stem))
  if (found === undefined) throw new Error(`K1 RevocationKind has no word starting "${stem}"`)
  return found
}
/** `TokenRegistry.onRevoked`'s `kind` (K1): an entry disabled, deleted, or its value changed. */
export const REVOCATION = Object.freeze({
  get disabled() { return kind('disabl') },
  get deleted() { return kind('delet') },
  get valueChanged() { return kind('value') },
})

/**
 * R-TOK-08 asks for "at least 256 bits" of entropy; K1 freezes the bytes (TOKEN_VALUE.generatedBytes),
 * not the floor, so the floor is the requirement's own number.
 */
export const REQUIREMENT = Object.freeze({ minEntropyBits: 256, bitsPerByte: 8 })

/** DSH's own vocabulary (installed SDK; the same on both). */
export const DSH = Object.freeze({
  cordis: '@deepseek-ai/cordis',
  credentialsLocal: '@deepseek-ai/dsh-credentials-local',
  launchEnvironment: '@deepseek-ai/dsh-launch-environment',
  storage: '@deepseek-ai/dsh-storage',
  storageJson: '@deepseek-ai/dsh-storage-json',
  storageDomain: '@deepseek-ai/dsh-storage-domain',
  /** dsh-launch-environment's inherited-environment layer. */
  processLayer: 'process',
  /** dsh-credentials-local's `source` for a stored value. */
  fileSource: 'file',
  /** cordis LoggerLevel.DEBUG: the exporter takes every level, so nothing the registry logs is missed. */
  allLevels: 3,
})

/** Fixture data: not product values. */
export const FIXTURE = Object.freeze({
  tempPrefix: 'fbtest-c-tokens-',
  domainDir: 'domain',
  /** AUTH-UC-01's own entry. */
  agentA: Object.freeze({ label: 'Agent A', ref: 'FB_EXT_1' }),
  agentB: Object.freeze({ label: 'Agent B', ref: 'FB_EXT_2' }),
  /** AUTH-ST-01 row 10k: the entry whose value duplicates Agent B's. */
  agentC: Object.freeze({ label: 'Agent C', ref: 'FB_EXT_3' }),
  /** Every user-set value starts with this marker, so a leak sweep finds it by text. */
  marker: 'FBTESTTOKENVALUE',
  pad: 'x',
  /** AUTH-BVA-03 row 6: the multi-byte last character. */
  multiByte: '€',
  /** AUTH-EP-04 row 8. */
  manyEntries: 10,
  manyRefPrefix: 'FB_MANY_',
  manyLabelPrefix: 'Agent ',
})

/** Harness timing (ms): not product values. */
export const WAIT = Object.freeze({
  /** How long an asynchronous outcome (a generated value, a status) may take to appear. */
  eventuallyMs: 5000,
  pollMs: 20,
  /** How long a negative ("nothing is generated") is watched. */
  quietMs: 400,
  testMs: 30000,
})

/** Rows that need a later task: each names the task that owns the observable. */
export const LATER = Object.freeze({
  nativeForm: 'C-WIRE (the connector\'s native settings schema: the tokens list is edited and saved in DSH\'s Plugins form, and a refused save keeps the form\'s previous document)',
  formStatus: 'C-WIRE (the read-only pair columns of each entry in the native form; AUTH-UC-09)',
  surfaces: 'C-WIRE (the settings read-back and every browser response of the wired connector, grepped for the planted value)',
  tokenEndpoint: 'C-WIRE (the token endpoint of C-OAUTH over this registry answers invalid_client for the value)',
  accessTokens: 'C-WIRE (C-OAUTH\'s access tokens invalidated through onRevoked and the entry generation, then a new token request)',
})
