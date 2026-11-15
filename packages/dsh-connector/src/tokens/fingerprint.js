/**
 * Token value fingerprints (design §5.5–§5.6, R-TOK-06; Fishball's decision 2026-11-14, question
 * 2 = A). A fingerprint is HMAC(`TOKEN_VALUE.digestAlgorithm`, key, value). It serves twice:
 * - in memory, as the comparison digest `match` checks in constant time;
 * - in the entry records, so a value changed or unset while the connector was down is still seen
 *   as a change at the next start (R-OA-06 revokes every token issued under the old value).
 * The key is random and lives in a credential record the connector owns, never in the storage
 * file, so the file holds nothing a short user-chosen value could be guessed from offline.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { TOKEN_VALUE } from '../../mcp-schema/constants.js'
import { DIGEST_KEY, FINGERPRINT_ENCODING, LOG } from './constants.js'
import { diagnosticOf } from '../errors.js'

const newKey = () => ({ key: randomBytes(DIGEST_KEY.keyBytes).toString(DIGEST_KEY.encoding), id: randomBytes(DIGEST_KEY.idBytes).toString(DIGEST_KEY.encoding) })
const isKey = (payload) => typeof payload?.key === 'string' && payload.key.length > 0 && typeof payload?.id === 'string' && payload.id.length > 0
const isKeyRecord = (record) => record?.kind === DIGEST_KEY.recordKind && isKey(record.payload)

/** Constant-time equality of two fingerprints; `null` (no value) equals only `null`. */
export function sameFingerprint(a, b) {
  if (a === null || b === null) return a === b
  const left = Buffer.from(a, FINGERPRINT_ENCODING)
  const right = Buffer.from(b, FINGERPRINT_ENCODING)
  return left.length === right.length && timingSafeEqual(left, right)
}

/**
 * The fingerprint key, created once under `DIGEST_KEY.recordKey` with `modifyRecord` (one
 * read-modify-write, so two processes never install two keys). When the store cannot hold it, a
 * key for this run only is used and logged: matching still works, but the stored fingerprints are
 * then of another key (their `keyId` differs) and are re-taken without counting as a change.
 * @returns {Promise<{id: string, of: (value: string) => string}>}
 */
export async function loadFingerprinter(credentials, logger) {
  let payload
  try {
    const record = await credentials.modifyRecord(DIGEST_KEY.recordKey, async (current) => (
      isKeyRecord(current) ? undefined : { kind: DIGEST_KEY.recordKind, payload: newKey() }))
    if (isKeyRecord(record)) payload = record.payload
  } catch (error) {
    logger.warn(LOG.digestKeyEphemeral, diagnosticOf(error))
  }
  payload ??= newKey()
  const secret = Buffer.from(payload.key, DIGEST_KEY.encoding)
  return Object.freeze({
    id: payload.id,
    of: (value) => createHmac(TOKEN_VALUE.digestAlgorithm, secret).update(value).digest(FINGERPRINT_ENCODING),
  })
}
