/**
 * ISUCC-INT-01: the instance's reinstall succession (README "The hosted token", Reinstall; R-HOST-09,
 * HOST-UC-03; K3 tokens.d.ts `retire` and `onChange`) over the REAL connector, in a real hosted
 * setup: a host DSH with the sibling dsh-connector checkout's connector and this checkout's
 * instance, which launches a real child that pairs with its hosted token. Observed through the
 * connector's own routes (token entries and pairs, the managed-session marks), DSH's session API
 * and the instance's hosted.json.
 *
 * Requirement: when the child lost its credential and hosted.json lists an entry the instance made,
 * the new entry is that entry's successor; once the new Fishball paired, `retire` moves the old
 * entry's managed sessions and name to it and deletes the old entry; until then it is retried at
 * each start and whenever the connector's pairs change.
 *
 * One host per SDK, the cases in order on the same home:
 * - HOST-UC-03: first start → a session handed over to the hosted agent → uninstall + start
 *   (a reinstall) → a pending succession → the successor pairs → the session, the name and the
 *   entry list move; nothing pending.
 * - restart: a pending succession whose successor is already paired (the state a host left when it
 *   stopped before the retry; hosted.json written by hand in its documented format) → a plain
 *   restart: no new entry, and the retire runs at the start.
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { after } from 'node:test'
import { caseTest, eachSdk } from '@dsh-instance/test-helpers/cases'
import { hostedSetup } from '@dsh-instance/test-helpers/hosted'
import { missingSibling } from '@dsh-instance/test-helpers/siblings'
import { untilValue } from '@dsh-instance/test-helpers/host-dsh'
import {
  DEFAULT_NAME, HOSTED_LABEL, entriesWhen, handOver, markOf, newSession, principalOf, readHosted, tokenEntries, uninstall, watchHosted, writeHosted,
} from './support/hosted-world.mjs'

const skip = missingSibling('connector') || missingSibling('fishball')
const ID = 'ISUCC-INT-01'
const show = (v) => JSON.stringify(v)

eachSdk((sdk) => {
  const setup = hostedSetup('isucc-' + sdk)
  after(() => setup.close())
  /** What the first case leaves for the second: the session the hosted agent manages. */
  let session

  caseTest(sdk, ID, 'HOST-UC-03', 'reinstall → retire refused successor-unpaired → the successor pairs → onChange → the retried retire moves the session and the name; the old entry is gone', async () => {
    const first = await setup.start(sdk)
    assert.equal(first.state, 'ready', 'precondition: the child is ready ' + show(first))
    const host = () => setup.host
    const [old] = await entriesWhen(host(), (e) => e.length === 1 && e[0].paired)
    assert.equal(old.label, HOSTED_LABEL)
    assert.deepEqual(readHosted(setup.home).entries, [old.key], 'hosted.json lists the first entry')
    session = await newSession(host(), path.join(setup.home, 'work'))
    await handOver(host(), session, await principalOf(host(), old))
    assert.equal((await markOf(host(), session))?.principal?.id, old.id, 'precondition: the old agent manages the session')

    let settled
    const seen = await watchHosted(setup.home, async () => {
      const again = await setup.restart(sdk, (home) => uninstall(home))
      assert.equal(again.state, 'ready', 'the reinstalled child is ready ' + show(again))
      settled = await entriesWhen(host(), (e) => e.length === 1 && e[0].key !== old.key && e[0].paired)
    })
    const [successor] = settled
    // The instance clears its pending succession after the connector's retire resolved: wait for it.
    const record = await untilValue(() => { const r = readHosted(setup.home); return r.succession === undefined && r })
    assert.deepEqual(record.entries, [old.key, successor.key], 'hosted.json lists the successor newest last')
    assert.ok(seen.some((r) => r.succession === old.key && r.entries.at(-1) === successor.key), 'no pending succession old → successor was recorded: ' + show(seen))
    assert.equal(successor.name, DEFAULT_NAME, 'the name moved (R-NAME-07)')
    assert.equal(successor.label, HOSTED_LABEL)
    assert.equal((await markOf(host(), session))?.principal?.id, successor.id, 'the session moved to the successor')
    assert.deepEqual((await tokenEntries(host())).map((e) => e.key), [successor.key], 'the old entry is gone')
  }, { skip })

  caseTest(sdk, ID, 'restart', 'a restart with the successor already paired: no new entry; the pending retire runs at the start', async () => {
    assert.ok(session, 'the HOST-UC-03 case did not run first')
    const host = () => setup.host
    const [old] = await tokenEntries(host())
    // A second child of the same instance id, recorded as if hosted.json had lost the old entry:
    // it pairs, nothing is retired, and both hosted entries stay.
    await setup.restart(sdk, (home) => { uninstall(home); writeHosted(home, (r) => { r.entries = []; delete r.succession }) })
    const both = await entriesWhen(host(), (e) => e.length === 2 && e.every((x) => x.paired))
    const successor = both.find((e) => e.key !== old.key)
    assert.equal((await markOf(host(), session))?.principal?.id, old.id, 'precondition: the old agent still manages the session')
    // The state a host leaves when it stops with the retire still pending: the successor newest, paired.
    await setup.host.stop()
    writeHosted(setup.home, (r) => { r.entries = [old.key, successor.key]; r.succession = old.key })
    const status = await setup.restart(sdk)
    assert.equal(status.state, 'ready', show(status))
    const after = await entriesWhen(host(), (e) => e.length === 1)
    assert.deepEqual(after.map((e) => e.key), [successor.key], 'the retire did not run at the start, or a new entry was created')
    const record = await untilValue(() => { const r = readHosted(setup.home); return r.succession === undefined && r })
    assert.deepEqual(record.entries, [old.key, successor.key], 'the restart created an entry')
    assert.equal(after[0].name, DEFAULT_NAME, 'the name moved')
    assert.equal((await markOf(host(), session))?.principal?.id, successor.id, 'the session moved')
  }, { skip })
})