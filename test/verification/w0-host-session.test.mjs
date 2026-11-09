/**
 * X11 supplement to XC-EP-V-05, derived only from the public requirement:
 * docs/plugins/instance-extension-points.md §1.1, X11 (and §5.6 W0 X0-C).
 * manager.userTexts({limit, maxChars}) returns newest-first user-authored
 * [{text, at}], with finite at equal to the originating host event.time, read-only.
 *
 * Classification: real installed, detached in-process Session API with bootChild's
 * fake agent/Cordis context and transport; disposable /private/tmp child files only.
 * This is NOT real persistence, agent wake, or a launched DSH host verification.
 * Do not synthesize an event.at alias: that would hide the host-shape regression.
 * The timestamp checks intentionally remain ordinary failing assertions, not TODOs.
 *
 * EP/DT: user-role messages from user vs non-user producers; filter before limit.
 * BVA: limit 1 and the available user count, with maxChars above every fixture text.
 * ST: empty detached Session -> two user appends -> later non-user append -> reads.
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { before, test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { bootChild } from '../support/instance-ext.mjs'
import { RUNTIME_PARENT_URL } from '../support/provider-sync-sdk.mjs'

const PROBE = Object.freeze({
  versions: Object.freeze(['0.2.1-rc.5', '0.2.2-rc.1']),
  timeoutMs: 5_000,
  userEvent: 'user/message',
  textBlock: 'text',
  append: Object.freeze({ surfaceOp: 'append' }),
  userSource: Object.freeze({ kind: 'user' }),
  // A user ROLE does not establish user authorship; the installed public API
  // allows any producer source, including this standard non-user source.
  nonUserSource: Object.freeze({ kind: 'system-prompt' }),
  text: Object.freeze({
    oldest: 'first user-authored host Session text',
    newest: 'second user-authored host Session text',
    nonUser: 'later producer-authored text, not a user quote',
  }),
  query: Object.freeze({ limit: 2, maxChars: 100 }),
  newestQuery: Object.freeze({ limit: 1, maxChars: 100 }),
})

let host
before(async () => {
  // A separate process selects each installed runtime; never silently use the
  // harness's older default or load two incompatible SDK copies in one process.
  assert.ok(process.env.FBTEST_DSH_RUNTIME, 'set FBTEST_DSH_RUNTIME to a pinned installed node_modules directory')
  const runtimeRequire = createRequire(RUNTIME_PARENT_URL)
  const manifest = JSON.parse(await readFile(runtimeRequire.resolve('@deepseek-ai/dsh/package.json'), 'utf8'))
  assert.ok(PROBE.versions.includes(manifest.version), 'select one of the two requested installed DSH versions')
  const [{ Session }, { createUserMessage }] = await Promise.all([
    import(pathToFileURL(runtimeRequire.resolve('@deepseek-ai/dsh-session')).href),
    import(pathToFileURL(runtimeRequire.resolve('@deepseek-ai/dsh-llm')).href),
  ])
  host = { Session, createUserMessage, version: manifest.version }
})

function appendMessage(session, text, source) {
  const message = host.createUserMessage({ content: [{ type: PROBE.textBlock, text }], source })
  return session.append(PROBE.userEvent, message, PROBE.append)
}

/** Assert read-only even when the public call throws against a frozen host log. */
function readTexts(h, options) {
  const manager = h.manager()
  const before = {
    events: structuredClone(manager.session.snapshotEvents()),
    seq: manager.session.seq,
    followups: structuredClone(manager.followups),
    options: structuredClone(options),
  }
  try {
    return h.requireInstance().manager.userTexts(options)
  } finally {
    assert.deepEqual(manager.session.snapshotEvents(), before.events, 'X11 must not change host events, order, messages or sources')
    assert.equal(manager.session.seq, before.seq, 'X11 must not append a host event')
    assert.deepEqual(manager.followups, before.followups, 'X11 must not queue a manager turn')
    assert.deepEqual(options, before.options, 'X11 must not change caller options')
  }
}

test('X11-HOST-SESSION: installed Session events retain user authorship, newest-first order and host timestamps', { timeout: PROBE.timeoutMs }, async (t) => {
  const h = await bootChild(t, { activate: true })
  const session = host.Session.create(h.manager().id)
  // Replace the fake Session boundary, not the public service under test. Its
  // snapshotEvents now exposes exactly the installed host's immutable events.
  h.manager().session = session
  t.diagnostic(`Installed DSH ${host.version}; detached in-process Session API, fake agent context; no persistence, wake or launched DSH host.`)
  assert.deepEqual(readTexts(h, PROBE.query), [], 'an empty host Session has no user quotes')

  const oldest = appendMessage(session, PROBE.text.oldest, PROBE.userSource)
  const newest = appendMessage(session, PROBE.text.newest, PROBE.userSource)
  appendMessage(session, PROBE.text.nonUser, PROBE.nonUserSource)
  const expected = [
    { text: PROBE.text.newest, event: newest },
    { text: PROBE.text.oldest, event: oldest },
  ]
  for (const { event } of expected) {
    assert.ok(Number.isFinite(event.time), 'precondition: the actual host append assigned a finite event.time')
    assert.equal(event.at, undefined, 'precondition: no fake event.at alias masks the host timestamp field')
  }
  const texts = readTexts(h, PROBE.query)

  await t.test('EP/DT/BVA/ST: only user-authored messages, newest first, filtered before limit, without mutation', () => {
    assert.deepEqual(texts.map((item) => item.text), expected.map((item) => item.text))
    assert.deepEqual(readTexts(h, PROBE.newestQuery).map((item) => item.text), [PROBE.text.newest])
    assert.deepEqual(readTexts(h, PROBE.query), texts, 'repeated reads retain the same public result')
  })

  await t.test('X11 at is finite for each user-authored host event', () => {
    for (const [index] of expected.entries()) {
      assert.ok(Number.isFinite(texts[index]?.at), 'X11 must return a finite at for each actual host event')
    }
  })

  await t.test('X11 at equals the originating host event.time exactly', () => {
    for (const [index, { event }] of expected.entries()) {
      assert.equal(texts[index]?.at, event.time, 'X11 at must equal host event.time, not a fabricated or missing timestamp')
    }
  })
})
