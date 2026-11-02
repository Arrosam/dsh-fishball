/**
 * P12 (DESIGN §10d "Fishball changing settings"): get_plugin_settings and set_plugin_settings.
 * One host with the settings fixtures (MANAGER_ENV); fbtest-settings is turned on for Fishball and
 * you set its secret through the route first, so every check that a secret never shows can bite.
 * Cases run in order.
 *
 * | id      | technique | requirement | expected |
 * |---------|-----------|-------------|----------|
 * | GPS-01  | EP | get_plugin_settings answers the rows with an editable schema, without a prompt | {ok:true, plugin, shared:false, rows:[{row, error:null, fields}]} with only the main row; the documented field keys, plus choices [fast, slow] only on mode (the fixed list); pluginValue/value/changed; no approval |
 * | GPS-02  | EP (secret fields, top-level and nested) | a secret carries set instead of its values | token and auth.key: secret true, set true, no pluginValue/value; auth.user plain; no secret in the result |
 * | GPS-03  | EP (unknown) | refused unknown-plugin | {ok:false, code:'unknown-plugin'}; no approval |
 * | GPS-04  | EP (on in DSH) | shared, nothing editable | {ok:true, shared:true, rows:[]} (A119) |
 * | GPS-05  | EP (Compaction) | the engine row is not editable | compaction-basic is not among the rows |
 * | GPS-06  | EP (invalid patch config) | the row's own error | fbtest-settings-bad: error a non-empty string |
 * | SPS-01  | DT (refusal order: unknown-plugin > shared-with-dsh > unknown-row > no-settings > secret-field > invalid > no-change) | refused before any prompt, in order | each row of the table, built to also break every later rule, answers the earliest code (a nested secret, a list of objects holding secrets, a replaced parent of a secret and a path under one count as secret fields); no refusal repeats rejected data; no approval asked; stored values, plugin and audit unchanged; no secret echoed |
 * | SPS-02  | ST (prompt open) | changes nothing until you click | while the prompt waits: stored values unchanged, no audit |
 * | SPS-03  | DT (answer Reject) | Reject changes nothing | {ok:false, code:'rejected'}; stored values unchanged; the plugin never receives the value; audited settings/fishball/rejected |
 * | SPS-04  | EP (prompt text) | names plugin and row, lists `path: old → new` as JSON, gives the reason | reason has the plugin key, row id, `limit: 3 → 8`, `nested.a: "x" → "z"` and Fishball's reason; no secret |
 * | SPS-05  | DT (answer Allow once) + ST (mid-turn) | Allow once saves; the change applies after Fishball's turn ends | {ok:true, plugin, row, changed:[limit, nested.a], note}; saved at once; not applied while the turn is still running; applied after; audited settings/fishball/ok; stored changedBy fishball |
 * | SPS-06  | EP | get after a change | limit: changed true, value 8, pluginValue 3 |
 * | SPS-07  | BVA (each value cut to 200 bytes: JSON 200 / 201 bytes) | the prompt cuts long values | 198 characters (200-byte JSON) shown whole; 199 (201 bytes) shown cut to ≤ 200 bytes |
 * | SPS-08  | EP (no-change after a save) | every value equals the current one | {limit: 8} after SPS-05: no-change, no prompt |
 * | SPS-10  | EP (beside a nested secret) | only paths at, above or under a secret are refused | {auth:{user:v}}: one prompt with `auth.user: "u" → "v"`; no secret in prompt or answer |
 * | SPS-11  | ST (your save while the prompt is open) | saves run one at a time against the values stored then | your {mode:slow} during the prompt and Fishball's {greeting:F} after Allow are both stored |
 * | SPS-12  | ST (re-check at save time) | Fishball's change is checked against the values stored when it is saved | you reset all of fbtest-settings-bad during the prompt; Allow answers invalid [name]; nothing saved |
 * | GPS-07  | EP (error with rejected secret data) | errors are cut before " but got " | fbtest-settings-leak: row error without "but got" or the secret; no secret in the result |
 * | SPS-09  | EP | no manager action changes the profile | package.json, cordis.patch.yml and lockfile byte-identical after every case |
 */
import assert from 'node:assert/strict'
import { after, afterEach, before, describe, it } from 'node:test'
import {
  API, APPROVER_HOLDS, AUDIT_OUTCOME, CHANGED_BY, COMPACTION, GET_CHOICE_FIELD_KEYS, GET_FIELD_KEYS, GET_SECRET_FIELD_KEYS, MANAGER_BUNDLES, MANAGER_CODE, MANAGER_ENV, MESSENGER, OUTCOME,
  PROMPT_VALUE_BYTES, SETTINGS_FIXTURE, SETTINGS_TOOLS,
} from './support/constants.mjs'
import {
  HOOK, T, assertCutError, assertNoSecret, bytes, callScript, fishballTool, jsonOf, pluginIn, privateApplies, profileSnapshot, promptLine, quiet, resultOfCall, saveSettings, settingsAudit,
  settledIdle, storedRecord, untilApply, untilCatalog, userOf,
} from './support/expect.mjs'
import { bootLive, newHome, until } from './support/host.mjs'

const SET = MANAGER_BUNDLES.settings
const DSH = MANAGER_BUNDLES.dsh
const BAD = MANAGER_BUNDLES.bad
const LEAK = MANAGER_BUNDLES.leak
const MAIN = SET.rows.main
const REASON = 'fbtest reason R-7731: the user asked for a higher limit'
const QUIET_MS = 1500

describe('P12 settings tools', () => {
  let host
  let home
  let fb
  let profile

  const getTool = (plugin) => fishballTool(host, fb, SETTINGS_TOOLS.get, { plugin })
  const setTool = (args, outcome) => fishballTool(host, fb, SETTINGS_TOOLS.set, { reason: REASON, ...args }, outcome)
  const user = () => userOf(host, SET.name, MAIN)
  const mainApplies = () => privateApplies(host, SET.name, MAIN)

  before(async () => {
    home = newHome('manager-settings-tools')
    const booted = await bootLive(home, { env: MANAGER_ENV })
    host = booted.host
    fb = booted.state?.sessionId
    assert.equal((await host.post(API.plugins, { plugin: SET.name, on: true })).status, 200, 'precondition: fbtest-settings on')
    assert.ok(await untilCatalog(host, (c) => pluginIn(c, SET.name)?.applied === true, 10000), 'precondition: mounted')
    // Your secret is stored, so a leak of it anywhere Fishball can see would show.
    assert.equal((await saveSettings(host, { plugin: SET.name, row: MAIN, values: { token: SETTINGS_FIXTURE.userSecret } })).status, 200, 'precondition: your secret saved')
    await settledIdle(host, fb)
    profile = profileSnapshot(home)
  }, HOOK)
  afterEach(() => { if (profile) assert.deepEqual(profileSnapshot(home), profile, 'SPS-09: the profile files changed') })
  after(async () => { await host?.stop() }, HOOK)

  it('GPS-01 get_plugin_settings lists the editable rows and their fields without asking', T, async () => {
    const r = await getTool(SET.name)
    assert.equal(r.approvals.length, 0, 'no prompt')
    assert.equal(r.json?.ok, true, r.result.text.slice(0, 500))
    assert.equal(r.json.plugin, SET.name)
    assert.equal(r.json.shared, false)
    assert.deepEqual(r.json.rows.map((x) => x.row), [MAIN], 'only the row with a schema')
    const row = r.json.rows[0]
    assert.equal(row.error, null)
    const paths = row.fields.map((f) => f.path)
    for (const p of SETTINGS_FIXTURE.fields) assert.ok(paths.includes(p), 'lists ' + p + ': ' + JSON.stringify(paths))
    for (const f of row.fields.filter((x) => !x.secret)) {
      // Only a field with a fixed list of values carries choices (DESIGN §10d).
      assert.deepEqual(Object.keys(f).sort(), f.path === SETTINGS_FIXTURE.choiceField.path ? GET_CHOICE_FIELD_KEYS : GET_FIELD_KEYS, 'keys of ' + f.path)
      assert.equal(typeof f.kind, 'string', f.path + ' kind')
      assert.equal(f.changed, false, f.path + ' unchanged')
      assert.deepEqual(f.value, f.pluginValue, f.path + ' value = pluginValue')
    }
    const field = (p) => row.fields.find((f) => f.path === p)
    assert.equal(field('limit').pluginValue, SETTINGS_FIXTURE.base.limit)
    assert.equal(field('greeting').pluginValue, SETTINGS_FIXTURE.base.greeting)
    assert.equal(field('nested.a').value, SETTINGS_FIXTURE.base.nested.a)
    assert.deepEqual(field('tags').value, SETTINGS_FIXTURE.base.tags)
    assert.deepEqual(field(SETTINGS_FIXTURE.choiceField.path).choices, SETTINGS_FIXTURE.choiceField.choices)
  })

  it('GPS-02 a secret field carries set instead of its values, and no secret is in the result', T, async () => {
    const r = await getTool(SET.name)
    assertNoSecret(assert, r.result.text, 'get_plugin_settings')
    const fields = r.json.rows[0].fields
    for (const p of SETTINGS_FIXTURE.secretFields) {
      const secret = fields.find((f) => f.path === p)
      assert.ok(secret, 'the secret field ' + p + ' is listed')
      assert.deepEqual(Object.keys(secret).sort(), GET_SECRET_FIELD_KEYS, p)
      assert.equal(secret.secret, true, p)
      assert.equal(secret.set, true, p)
    }
    // accounts holds secrets inside its list; whether it is marked secret is not specified, only that its value never shows them.
    for (const f of fields.filter((x) => !SETTINGS_FIXTURE.secretFields.includes(x.path) && x.path !== 'accounts')) assert.equal(f.secret, false, f.path + ' secret')
    const accounts = fields.find((f) => f.path === 'accounts')
    if (accounts && !accounts.secret) assert.deepEqual(accounts.value, SETTINGS_FIXTURE.base.accounts, 'a list of objects shows its items with their secrets removed')
    // auth.user is a plain field beside the nested secret.
    assert.equal(fields.find((f) => f.path === 'auth.user')?.value, SETTINGS_FIXTURE.base.auth.user)
  })

  it('GPS-03 get_plugin_settings of an unknown plugin is refused unknown-plugin', T, async () => {
    const r = await getTool('fbtest-no-such-plugin')
    assert.equal(r.approvals.length, 0)
    assert.equal(r.json?.ok, false)
    assert.equal(r.json?.code, MANAGER_CODE.unknownPlugin)
  })

  it('GPS-04 a plugin on in DSH is shared and has no editable rows', T, async () => {
    const r = await getTool(DSH.name)
    assert.equal(r.approvals.length, 0)
    assert.equal(r.json?.ok, true, r.result.text.slice(0, 500))
    assert.equal(r.json.shared, true)
    assert.deepEqual(r.json.rows, [])
  })

  it('GPS-05 the Compaction engine row is not among the editable rows', T, async () => {
    const r = await getTool(COMPACTION.plugin)
    assert.equal(r.json?.ok, true, r.result.text.slice(0, 500))
    assert.equal(r.json.rows.some((x) => x.row === COMPACTION.engineRow), false)
  })

  it('GPS-06 a row whose own patch config is invalid carries the schema\'s error', T, async () => {
    const r = await getTool(BAD.name)
    assert.equal(r.json?.ok, true, r.result.text.slice(0, 500))
    const row = r.json.rows.find((x) => x.row === BAD.rows.main)
    assert.equal(typeof row?.error, 'string')
    assert.ok(row.error.length > 0)
  })

  it('GPS-07 the error Fishball sees is cut before " but got " and carries no secret', T, async () => {
    const r = await getTool(LEAK.name)
    assert.equal(r.json?.ok, true, r.result.text.slice(0, 500))
    assertCutError(assert, r.json.rows.find((x) => x.row === LEAK.rows.main)?.error, 'get_plugin_settings error')
    assertNoSecret(assert, r.result.text, 'get_plugin_settings of fbtest-settings-leak')
  })

  // Each row also breaks every rule after its own, so only the specified order gives the expected code.
  const SECRET = { token: SETTINGS_FIXTURE.userSecret }
  const refusals = [
    ['unknown plugin', { plugin: 'fbtest-no-such-plugin', row: 'nope', values: { ...SECRET, limit: 99 } }, MANAGER_CODE.unknownPlugin],
    ['on in DSH, unknown row, secret', { plugin: DSH.name, row: 'nope', values: { ...SECRET, count: -1 } }, MANAGER_CODE.sharedWithDsh],
    ['unknown row, secret, invalid', { plugin: SET.name, row: 'nope', values: { ...SECRET, limit: 99 } }, MANAGER_CODE.unknownRow],
    ['the Messenger look (no rows)', { plugin: MESSENGER.key, row: 'messenger', values: { a: 1 } }, MANAGER_CODE.unknownRow],
    ['a row without a schema, secret', { plugin: SET.name, row: SET.rows.side, values: { ...SECRET, limit: 99 } }, MANAGER_CODE.noSettings],
    ['the Compaction engine row', { plugin: COMPACTION.plugin, row: COMPACTION.engineRow, values: { thresholdRatio: 2 } }, MANAGER_CODE.noSettings],
    ['a secret with an invalid value', { plugin: SET.name, row: MAIN, values: { ...SECRET, limit: 99 } }, MANAGER_CODE.secretField],
    ['a secret alone, cleared', { plugin: SET.name, row: MAIN, values: { token: '' } }, MANAGER_CODE.secretField],
    ['a nested secret with an invalid value', { plugin: SET.name, row: MAIN, values: { auth: { key: 'x' }, limit: 99 } }, MANAGER_CODE.secretField],
    ['a nested secret beside a changed sibling', { plugin: SET.name, row: MAIN, values: { auth: { user: 'v', key: SETTINGS_FIXTURE.userSecret } } }, MANAGER_CODE.secretField],
    ['a list of objects holding secrets (above a secret)', { plugin: SET.name, row: MAIN, values: { accounts: [{ name: 'b', secret: 'x' }] } }, MANAGER_CODE.secretField],
    ['a list of objects holding secrets, given without them', { plugin: SET.name, row: MAIN, values: { accounts: [{ name: 'b' }] } }, MANAGER_CODE.secretField],
    ['the parent object of a secret replaced (also invalid)', { plugin: SET.name, row: MAIN, values: { auth: 'x' } }, MANAGER_CODE.secretField],
    ['a path under a secret', { plugin: SET.name, row: MAIN, values: { token: { deep: 1 } } }, MANAGER_CODE.secretField],
    ['invalid limit with rejected data', { plugin: SET.name, row: MAIN, values: { limit: SETTINGS_FIXTURE.rejected } }, MANAGER_CODE.invalid, ['limit']],
    ['an invalid patch config holding a secret', { plugin: LEAK.name, row: LEAK.rows.main, values: { note: 2 } }, MANAGER_CODE.invalid, ['pin']],
    ['invalid limit 11 with an unchanged greeting', { plugin: SET.name, row: MAIN, values: { limit: 11, greeting: SETTINGS_FIXTURE.base.greeting } }, MANAGER_CODE.invalid, ['limit']],
    ['invalid nested.b with an unchanged limit', { plugin: SET.name, row: MAIN, values: { limit: SETTINGS_FIXTURE.base.limit, nested: { b: -1 } } }, MANAGER_CODE.invalid, ['nested', 'b']],
    ['an invalid patch config', { plugin: BAD.name, row: BAD.rows.main, values: { size: 3 } }, MANAGER_CODE.invalid, ['name']],
    ['every value equal to the current one', { plugin: SET.name, row: MAIN, values: { limit: SETTINGS_FIXTURE.base.limit, nested: { a: SETTINGS_FIXTURE.base.nested.a } } }, MANAGER_CODE.noChange],
  ]
  for (const [label, args, code, path] of refusals) {
    it('SPS-01 ' + label + ' is refused ' + code + ' before any prompt', T, async () => {
      const before = { user: await user(), audit: settingsAudit(home, SET.name).length, applies: (await mainApplies()).length }
      // An unexpected prompt would be allowed, so a missing refusal cannot hide behind Reject.
      const r = await setTool(args, OUTCOME.allow)
      assert.equal(r.approvals.length, 0, 'no prompt: ' + JSON.stringify(r.approvals))
      assert.equal(r.json?.ok, false, r.result.text.slice(0, 500))
      assert.equal(r.json?.code, code)
      if (path) assert.deepEqual(r.json.path, path)
      assertNoSecret(assert, r.result.text, 'the refusal')
      assert.equal(r.result.text.includes(SETTINGS_FIXTURE.rejected), false, 'the refusal repeats the rejected value')
      assert.equal(r.result.text.includes(SETTINGS_FIXTURE.errorCut.trim()), false, 'the refusal carries rejected data')
      assert.deepEqual(await user(), before.user, 'stored values unchanged')
      assert.equal(settingsAudit(home, SET.name).length, before.audit, 'no settings audit entry')
      await quiet(300)
      assert.equal((await mainApplies()).length, before.applies, 'the plugin was not restarted')
    })
  }

  /** One set_plugin_settings call whose prompt is held open; returns the held turn's tool call id. */
  async function startHeldSet(values, { plugin = SET.name, row = MAIN } = {}) {
    await settledIdle(host, fb)
    await host.call('setApprover', { outcome: APPROVER_HOLDS })
    const callId = 'call_fbtest_sps_' + Date.now()
    const script = callScript(SETTINGS_TOOLS.set, { plugin, row, values, reason: REASON }, callId)
    await host.call('driveStart', { sessionId: fb, text: 'fbtest set settings', script })
    assert.ok(await until(async () => (await host.call('heldApprovals')) === 1, 10000, 50), 'the prompt is open')
    return callId
  }

  let rejectPrompt
  it('SPS-02 and SPS-03 nothing changes while the prompt waits, and Reject changes nothing', T, async () => {
    const before = { user: await user(), audit: settingsAudit(home, SET.name).length, applies: (await mainApplies()).length }
    const callId = await startHeldSet({ limit: 8, nested: { a: 'z' } })
    try {
      await quiet(500)
      assert.deepEqual(await user(), before.user, 'SPS-02: unchanged while the prompt waits')
      assert.equal(settingsAudit(home, SET.name).length, before.audit, 'SPS-02: no audit yet')
      rejectPrompt = (await host.call('approvals', { sessionId: fb })).at(-1)
    } finally {
      await host.call('releaseApproval', { outcome: OUTCOME.reject })
      await host.call('setApprover', { outcome: OUTCOME.reject })
    }
    const res = await resultOfCall(host, fb, callId)
    assert.ok(await settledIdle(host, fb))
    assert.equal(res?.json?.ok, false, res?.text)
    assert.equal(res.json.code, MANAGER_CODE.rejected)
    assert.deepEqual(await user(), before.user, 'SPS-03: unchanged after Reject')
    await quiet(QUIET_MS)
    assert.equal((await mainApplies()).slice(before.applies).some((e) => e.config.limit === 8), false, 'the plugin never receives it')
    const audit = settingsAudit(home, SET.name).slice(before.audit)
    assert.equal(audit.length, 1, JSON.stringify(audit))
    assert.equal(audit[0].by, CHANGED_BY.fishball)
    assert.equal(audit[0].outcome, AUDIT_OUTCOME.rejected)
  })

  it('SPS-04 the prompt names plugin and row, lists each change as path: old → new, and gives the reason', T, () => {
    assert.ok(rejectPrompt, 'precondition: SPS-02 captured the prompt')
    assert.equal(rejectPrompt.toolName, SETTINGS_TOOLS.set)
    const reason = rejectPrompt.reason
    assert.equal(typeof reason, 'string')
    assert.ok(reason.includes(SET.name), 'names the plugin:\n' + reason)
    assert.ok(reason.includes(MAIN), 'names the row')
    assert.ok(reason.includes(REASON), 'gives Fishball\'s reason')
    assert.deepEqual(promptLine(reason, 'limit') && { old: promptLine(reason, 'limit').old, new: promptLine(reason, 'limit').new }, { old: '3', new: '8' }, 'limit line:\n' + reason)
    const nested = promptLine(reason, 'nested.a')
    assert.deepEqual(nested && { old: nested.old, new: nested.new }, { old: '"x"', new: '"z"' }, 'nested.a line:\n' + reason)
    assertNoSecret(assert, reason, 'the prompt')
  })

  it('SPS-05 Allow once saves at once; the plugin receives the change only after Fishball\'s turn ends', T, async () => {
    const before = { audit: settingsAudit(home, SET.name).length, applies: (await mainApplies()).length }
    const callId = await startHeldSet({ limit: 8, nested: { a: 'z' } })
    try {
      // Hold Fishball's next model request, so its turn is still running after the tool returns.
      await host.call('holdNext', { sessionId: fb })
      await host.call('releaseApproval', { outcome: OUTCOME.allow })
      await host.call('setApprover', { outcome: OUTCOME.reject })
      assert.ok(await until(() => host.call('isHeld', { sessionId: fb }), 10000, 50), 'Fishball is still in its turn')
      const res = await resultOfCall(host, fb, callId)
      assert.equal(res?.json?.ok, true, res?.text)
      assert.equal(res.json.plugin, SET.name)
      assert.equal(res.json.row, MAIN)
      assert.deepEqual([...res.json.changed].sort(), ['limit', 'nested.a'])
      assert.equal(typeof res.json.note, 'string')
      assertNoSecret(assert, res.text, 'the answer')
      const u = await user()
      assert.equal(u.limit, 8, 'saved at once')
      assert.equal(u.nested?.a, 'z')
      await quiet(QUIET_MS)
      assert.equal((await mainApplies()).slice(before.applies).some((e) => e.config.limit === 8), false, 'not applied mid-turn')
    } finally {
      await host.call('releaseHold', { sessionId: fb })
      await host.call('setApprover', { outcome: OUTCOME.reject })
    }
    assert.ok(await settledIdle(host, fb), 'the turn ended')
    const applied = await untilApply(host, SET.name, MAIN, before.applies, (c) => c.limit === 8 && c.nested?.a === 'z')
    assert.ok(applied, 'applied after the turn')
    assert.equal(applied.config.token, SETTINGS_FIXTURE.userSecret, 'your secret is kept')
    const audit = settingsAudit(home, SET.name).slice(before.audit)
    assert.equal(audit.length, 1, JSON.stringify(audit))
    assert.equal(audit[0].by, CHANGED_BY.fishball)
    assert.equal(audit[0].outcome, AUDIT_OUTCOME.ok)
    assert.equal(storedRecord(home, MAIN)?.changedBy, CHANGED_BY.fishball)
  })

  it('SPS-06 get_plugin_settings shows the changed field', T, async () => {
    const r = await getTool(SET.name)
    const limit = r.json.rows[0].fields.find((f) => f.path === 'limit')
    assert.equal(limit.changed, true)
    assert.equal(limit.value, 8)
    assert.equal(limit.pluginValue, SETTINGS_FIXTURE.base.limit)
    assert.equal(r.json.rows[0].fields.find((f) => f.path === 'greeting').changed, false)
  })

  for (const [chars, whole] of [[PROMPT_VALUE_BYTES - 2, true], [PROMPT_VALUE_BYTES - 1, false]]) {
    it('SPS-07 a new value whose JSON is ' + (chars + 2) + ' bytes is shown ' + (whole ? 'whole' : 'cut to 200 bytes'), T, async () => {
      const greeting = 'g'.repeat(chars)
      const r = await setTool({ plugin: SET.name, row: MAIN, values: { greeting } }, OUTCOME.reject)
      assert.equal(r.approvals.length, 1, 'one prompt')
      assert.equal(r.json?.code, MANAGER_CODE.rejected)
      const line = promptLine(r.approvals[0].reason, 'greeting')
      assert.ok(line, 'the greeting line:\n' + r.approvals[0].reason)
      assert.equal(line.old, JSON.stringify(SETTINGS_FIXTURE.base.greeting))
      if (whole) assert.equal(line.new, JSON.stringify(greeting))
      else {
        assert.ok(bytes(line.new) <= PROMPT_VALUE_BYTES, 'cut to ' + bytes(line.new) + ' bytes')
        assert.equal(r.approvals[0].reason.includes(JSON.stringify(greeting)), false, 'the whole value is not shown')
        assert.ok(line.new.startsWith('"ggg'), 'a prefix of the value: ' + line.new.slice(0, 20))
      }
    })
  }

  it('SPS-08 a value equal to the one just saved is refused no-change before any prompt', T, async () => {
    const r = await setTool({ plugin: SET.name, row: MAIN, values: { limit: 8 } }, OUTCOME.allow)
    assert.equal(r.approvals.length, 0)
    assert.equal(r.json?.code, MANAGER_CODE.noChange)
    assert.equal(jsonOf(r.result)?.ok, false)
  })

  it('SPS-10 a field beside a nested secret is not refused; its prompt shows no secret', T, async () => {
    const r = await setTool({ plugin: SET.name, row: MAIN, values: { auth: { user: 'v' } } }, OUTCOME.reject)
    assert.equal(r.approvals.length, 1, 'one prompt: ' + r.result.text.slice(0, 300))
    assert.equal(r.json?.code, MANAGER_CODE.rejected)
    const line = promptLine(r.approvals[0].reason, 'auth.user')
    assert.deepEqual(line && { old: line.old, new: line.new }, { old: '"u"', new: '"v"' }, 'auth.user line:\n' + r.approvals[0].reason)
    assertNoSecret(assert, r.approvals[0].reason, 'the prompt')
    assertNoSecret(assert, r.result.text, 'the answer')
  })

  it('SPS-11 a change you save while Fishball\'s prompt is open is kept after Allow once', T, async () => {
    const callId = await startHeldSet({ greeting: 'F' })
    try {
      const mine = await saveSettings(host, { plugin: SET.name, row: MAIN, values: { mode: 'slow' } })
      assert.equal(mine.status, 200, mine.text)
    } finally {
      await host.call('releaseApproval', { outcome: OUTCOME.allow })
      await host.call('setApprover', { outcome: OUTCOME.reject })
    }
    const res = await resultOfCall(host, fb, callId)
    assert.ok(await settledIdle(host, fb))
    assert.equal(res?.json?.ok, true, res?.text)
    const u = await user()
    assert.equal(u.greeting, 'F', 'Fishball\'s change saved')
    assert.equal(u.mode, 'slow', 'your change kept')
    assert.equal(u.limit, 8, 'earlier values kept')
  })

  it('SPS-12 Fishball\'s change is checked again at save time against the values stored then', T, async () => {
    const row = BAD.rows.main
    assert.equal((await saveSettings(host, { plugin: BAD.name, row, values: { name: 'n' } })).status, 200, 'precondition: the row is valid with your name')
    const callId = await startHeldSet({ size: 5 }, { plugin: BAD.name, row })
    try {
      // Removing all values is never refused; it makes Fishball's pending change invalid.
      const mine = await saveSettings(host, { plugin: BAD.name, row, reset: [[]] })
      assert.equal(mine.status, 200, mine.text)
    } finally {
      await host.call('releaseApproval', { outcome: OUTCOME.allow })
      await host.call('setApprover', { outcome: OUTCOME.reject })
    }
    const res = await resultOfCall(host, fb, callId)
    assert.ok(await settledIdle(host, fb))
    assert.equal(res?.json?.ok, false, res?.text)
    assert.equal(res.json.code, MANAGER_CODE.invalid)
    assert.deepEqual(res.json.path, ['name'])
    assert.deepEqual(await userOf(host, BAD.name, row), {}, 'nothing saved')
  })
})
