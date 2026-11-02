/**
 * Helpers for the revision 11 cases that read a session through Fishball's read_session: a blank live session,
 * messages appended straight into its log (injectUserMessage), and one Fishball turn that relates the session (a watch)
 * and reads it. Same moves as messaging-read-roles.test.mjs, shared by the cases that change the bounds' settings.
 */
import assert from 'node:assert/strict'
import { PRESET } from './constants.mjs'
import { jsonOf, settledIdle, turn, untrustedBlock } from './expect.mjs'

/** The helpers for one host handle `w` (from useHost in support/start-session.mjs). */
export function readHelpers(w) {
  const blank = async (name) => (await w.host.call('ordinary', { preset: PRESET.bare, folder: name })).sessionId
  const inject = (sessionId, text, source, omitSource = false) => w.host.call('injectUserMessage', { sessionId, text, source, omitSource })
  /** Several Fishball tool calls in one turn; returns their parsed answers. */
  async function fishballTools(calls) {
    await settledIdle(w.host, w.fb)
    const r = await turn(w.host, w.fb, [...calls.map(([tool, args]) => [{ tool, args }]), [{ text: 'done' }]])
    assert.equal(r.results.length, calls.length, 'one result per call')
    return r.results.map(jsonOf)
  }
  /** Read a session that is already related to Fishball; returns the parsed messages. */
  async function readRelated(sessionId) {
    await w.host.call('flush', { sessionId })
    const [answer] = await fishballTools([['read_session', { session_id: sessionId }]])
    assert.equal(answer?.ok, true, JSON.stringify(answer))
    const block = untrustedBlock(answer.session)
    assert.ok(Array.isArray(block.fields.messages), 'messages is a JSON array')
    return block.fields.messages
  }
  /** Relate the session (a watch on it) and read it. */
  async function read(sessionId) {
    const [watch] = await fishballTools([['watch_session', { session_id: sessionId }]])
    assert.equal(watch?.ok, true, JSON.stringify(watch))
    return readRelated(sessionId)
  }
  return { blank, inject, fishballTools, read, readRelated }
}
