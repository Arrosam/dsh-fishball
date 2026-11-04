/** Observable notice vocabulary: requirements give the meaning, not the whole copy. */
import assert from 'node:assert/strict'
import { OWN_REQUEST } from './constants.mjs'

export const OWN_NOTICE = Object.freeze({
  approved: /\[approved\b|user (?:allowed|approved) your request/i,
  rejected: /user rejected your request/i,
})

/** Count deliveries, not model-context repetitions of the same message. */
export function assertOwnNotices(messages, { approved, rejected }) {
  const texts = messages.map((message) => message.text)
  assert.equal(texts.filter((text) => OWN_NOTICE.approved.test(text)).length, approved, 'approval notice count: ' + JSON.stringify(texts))
  assert.equal(texts.filter((text) => OWN_NOTICE.rejected.test(text)).length, rejected, 'rejection notice count: ' + JSON.stringify(texts))
  assert.equal(texts.length, approved + rejected, 'no extra notice for this request: ' + JSON.stringify(texts))
  if (approved) assert.match(texts.find((text) => OWN_NOTICE.approved.test(text)), OWN_REQUEST.again)
}
