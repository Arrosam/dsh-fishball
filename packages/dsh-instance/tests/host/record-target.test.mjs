/**
 * The host's own files and handoffs, read through their exports:
 * - the hosted record (hosted-record.js JSDoc; README): `<mainHome>/fishball/hosted.json`, private,
 *   `{format: 1, instanceId, entries}`, newest last, written at once when missing, durable across a
 *   reopen; a damaged one rejects INVALID_HOSTED_RECORD;
 * - fishballDirectory (files.js JSDoc, R-FIX-INSTANCE F08): `<home>/fishball`, proven, creates nothing;
 * - childTargetUrl (hosted.js JSDoc, MULTI-2): the reserved parent's URL, or '' without a usable
 *   connector; no remote override exists;
 * - the launch overlay (overlay.js JSDoc, R-HOST-04): the child-side row with config exactly
 *   `{targetUrl}`, no token and no key;
 * - the host row's surface (R-ARCH-05, R-HOST-05, MULTI-2) and model sync's names (Q-G7).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { caseTest, eachSdk } from '@dsh-instance/test-helpers/cases'
import { modeOf } from '@dsh-instance/test-helpers/scratch'
import { packageFile } from '../support/instance.mjs'
import { CONNECTOR_MCP, FIXTURE, HEX64, IMPORT, K3, MODULE, RECORD, ROW, SECRET_LIKE, SESSION_LIKE, SYNC } from './constants.mjs'
import { settle, textOf } from './fakes.mjs'
import { homeOf, load, recordFile, scratch } from './worlds.mjs'

const tree = (dir) => fs.readdirSync(dir, { recursive: true }).map(String).sort()

/** The rows a composed native profile always holds (overlay.js: without them UNSUPPORTED_PROFILE). */
const PROFILE_ROWS = ['hmr', 'sandbox-policy', 'approval', 'webserver', 'web-runtime'].map((id) => ({ id, name: '@deepseek-ai/fbtest-' + id, config: {} }))

eachSdk((sdk) => {
  // ============================================================ the hosted record
  caseTest(sdk, 'RECORD', 'missing', 'a missing file: no entries, written at once with a new instanceId; add() keeps {format: 1, instanceId, entries} mode 0600, newest last; a reopen keeps both', async (t) => {
    const { openHostedRecord } = await load(sdk, 'record')
    const file = recordFile(scratch(t))
    const record = await openHostedRecord(file)
    assert.deepEqual(record.entries(), [])
    assert.ok(fs.existsSync(file))
    const id = record.instanceId
    assert.equal(typeof id, 'string')
    await record.add('a')
    await record.add('b')
    assert.deepEqual(record.entries(), ['a', 'b'])
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { format: RECORD.format, instanceId: id, entries: ['a', 'b'] })
    assert.equal(modeOf(file), RECORD.mode)
    const again = await openHostedRecord(file)
    assert.deepEqual([again.entries(), again.instanceId], [['a', 'b'], id])
  })
  for (const [title, text] of [['not JSON', '{'], ['another format', JSON.stringify({ format: 2, entries: [] })], ['entries not an array', JSON.stringify({ format: 1, entries: 'a' })]]) {
    caseTest(sdk, 'RECORD', 'damaged', `a damaged record (${title}) rejects INVALID_HOSTED_RECORD`, async (t) => {
      const { openHostedRecord } = await load(sdk, 'record')
      const file = recordFile(scratch(t))
      fs.writeFileSync(file, text, { mode: 0o600 })
      assert.equal((await settle(() => openHostedRecord(file))).error?.code, RECORD.damaged)
    })
  }

  // ============================================================ fishballDirectory (F08)
  for (const [part, setup, expected] of [
    ['canonical, no fishball', () => {}, 'path'],
    ['canonical, fishball dir', (home) => fs.mkdirSync(path.join(home, RECORD.dir)), 'path'],
    ['fishball a symlink', (home, base) => { fs.mkdirSync(path.join(base, 'outside')); fs.symlinkSync(path.join(base, 'outside'), path.join(home, RECORD.dir)) }, ROW.unsafeDirectory],
    ['fishball a file', (home) => fs.writeFileSync(path.join(home, RECORD.dir), ''), ROW.unsafeDirectory],
  ]) {
    caseTest(sdk, 'RFI-F08', 'fishballDirectory ' + part, `fishballDirectory: ${part} → ${expected === 'path' ? '<home>/fishball, nothing created' : expected}`, async (t) => {
      const { home, base } = homeOf(t, 'canonical')
      setup(home, base)
      const before = tree(base)
      const { fishballDirectory } = await load(sdk, 'files')
      const outcome = await settle(() => fishballDirectory(home))
      if (expected === 'path') assert.equal(outcome.value, path.join(home, RECORD.dir))
      else assert.equal(outcome.error?.code, expected)
      assert.deepEqual(tree(base), before)
    })
  }
  for (const kind of ['alias', 'ancestor']) {
    caseTest(sdk, 'RFI-F08', 'fishballDirectory ' + kind, `fishballDirectory: a main home ${kind === 'alias' ? 'that is a symlink' : 'under a symlinked ancestor'} → INVALID_MAIN_HOME, nothing created`, async (t) => {
      const { home, base } = homeOf(t, kind)
      const before = tree(base)
      const { fishballDirectory } = await load(sdk, 'files')
      assert.equal((await settle(() => fishballDirectory(home))).error?.code, ROW.invalidHome)
      assert.deepEqual(tree(base), before)
    })
  }

  // ============================================================ childTargetUrl (MULTI-2: no remote override)
  const parent = FIXTURE.hostOrigin + CONNECTOR_MCP
  for (const [rule, input, expected] of [
    [1, { instanceTargetUrl: '', hostOrigin: FIXTURE.hostOrigin, connectorUsable: true }, parent],
    [2, { instanceTargetUrl: '', hostOrigin: FIXTURE.hostOrigin, connectorUsable: false }, ''],
    [3, { instanceTargetUrl: FIXTURE.remote, hostOrigin: FIXTURE.hostOrigin, connectorUsable: true }, parent],
    [4, { instanceTargetUrl: FIXTURE.remote, hostOrigin: FIXTURE.hostOrigin, connectorUsable: false }, ''],
    [5, { instanceTargetUrl: FIXTURE.spaces, hostOrigin: FIXTURE.hostOrigin, connectorUsable: true }, parent],
    [6, { instanceTargetUrl: '', connectorUsable: true }, ''],
    [7, { instanceTargetUrl: 'x', hostOrigin: FIXTURE.hostOrigin, connectorUsable: true }, parent],
  ]) {
    caseTest(sdk, 'TARGET-URL', rule, `childTargetUrl(${JSON.stringify(input)}) → ${JSON.stringify(expected)}`, async () => {
      const { childTargetUrl } = await load(sdk, 'hosted')
      assert.equal(childTargetUrl(input), expected)
    })
  }

  // ============================================================ the launch overlay (HOST-UC-06 post)
  const overlayFor = async (t, child) => {
    const { launchOverlay } = await load(sdk, 'runtime')
    const root = scratch(t)
    const paths = { mainHome: root, home: path.join(root, 'dsh-home'), agentsHome: path.join(root, 'agents-home'), workspace: path.join(root, 'workspace') }
    const control = { secret: 'a'.repeat(64), endpoint: 'fbtest-endpoint' }
    return launchOverlay(paths, { hostId: 'fbtest-host', instanceId: FIXTURE.instanceId }, path.join(root, 'snapshot', 'native-child.js'), {}, control, PROFILE_ROWS, child)
  }
  const inserted = (ops) => ops.filter((op) => Array.isArray(op?.insert)).flatMap((op) => op.insert)
  for (const [title, targetUrl] of [['a blank target', FIXTURE.blank], ['the host connector URL', parent], ['a remote target', FIXTURE.remote]]) {
    caseTest(sdk, 'HOST-UC-06', 'post', `the overlay inserts dsh-instance-child with config exactly {targetUrl} for ${title}`, async (t) => {
      const row = inserted(await overlayFor(t, { targetUrl })).find((r) => r.id === IMPORT.childRow)
      assert.deepEqual(row?.config, { [IMPORT.targetField]: targetUrl })
    })
  }
  caseTest(sdk, 'HOST-UC-06', 'post', 'no row config of the child-side row holds admissionKey or a 64-hex secret (the key derives from the lifecycle secret)', async (t) => {
    const row = inserted(await overlayFor(t, { targetUrl: FIXTURE.blank })).find((r) => r.id === IMPORT.childRow)
    assert.equal(textOf(row.config).includes('admissionKey'), false)
    assert.equal(HEX64.test(textOf(row.config)), false)
    for (const op of inserted(await overlayFor(t, { targetUrl: FIXTURE.blank }))) assert.equal(textOf(op.config).includes('"admissionKey"'), false, op.id)
  })
  caseTest(sdk, 'HOST-UC-06', 'post', 'the overlay carries no token value, whatever the child row is given', async (t) => {
    assert.equal(textOf(await overlayFor(t, { targetUrl: FIXTURE.remote })).includes(FIXTURE.planted), false)
  })

  // ============================================================ HOST-EP-01: the host row's surface
  caseTest(sdk, 'HOST-EP-01', 3, "the host row's inject list names no session, approval, question or prompt service", async () => {
    const host = await load(sdk, 'host')
    assert.ok(Array.isArray(host.inject))
    assert.deepEqual(host.inject.filter((n) => SESSION_LIKE.test(n)), [])
  })
  caseTest(sdk, 'HOST-EP-01', 2, 'dshConnectorTokens is not in inject (an optional service must not gate the row)', async () => {
    const host = await load(sdk, 'host')
    assert.equal(host.inject.some((n) => n.replace(/\?$/, '') === K3.tokensService), false)
  })
  caseTest(sdk, 'HOST-EP-01', 'R-HOST-05 (MULTI-2)', 'the host Config has no targetUrl override and no token or credential-reference field', async () => {
    const { Config } = await load(sdk, 'host')
    assert.ok(Config?.dict)
    assert.equal(Object.hasOwn(Config.dict, IMPORT.targetField), false)
    assert.deepEqual(Object.keys(Config.dict).filter((k) => SECRET_LIKE.test(k)), [])
  })

  // ============================================================ SYNC: neutral names, no default model (Q-G7)
  caseTest(sdk, 'SYNC', 'names', 'provider-sync-host uses the neutral names dsh-sync-default, dsh-sync-default-model and logger dsh-provider-sync', async () => {
    const { PROVIDER_SYNC_HOST: c } = await load(sdk, 'syncHost')
    assert.deepEqual([c.defaultRoute, c.defaultModel, c.diagnostic?.logger], [SYNC.defaultRoute, SYNC.defaultModel, SYNC.logger])
  })
  // Q-G7 ("sync copies the model list only; the model Fishball uses is chosen in Fishball"). A
  // behaviour run needs a child DSH's settings and session controller, so the published sync code is
  // checked for the one row and the calls that would change a default or session model.
  caseTest(sdk, 'SYNC', 'Q-G7', 'the provider-sync target and host never name agent-default-model or a model switch (applyModel, setDefaultModel)', () => {
    for (const rel of [MODULE.syncTarget, MODULE.syncHost]) {
      const text = fs.readFileSync(packageFile(rel), 'utf8')
      assert.equal(text.includes(SYNC.defaultModelNs), false, rel)
      assert.equal(/applyModel|setDefaultModel|modelSet/.test(text), false, rel)
    }
  })
})