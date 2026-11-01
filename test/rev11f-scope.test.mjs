/**
 * Revision 11 rev11f: "never freezes" covers all of Fishball's prompts (DESIGN §7a.11 "Which requests", §16 Q-r11-own-scope;
 * requirements item 21, DESIGN §14 row rev11f): the unchecked-tools prompt, turning on one of Fishball's own plugins,
 * set_plugin_settings, and a plugin tool that asks in Fishball's session. Each returns at once with a card of Fishball's
 * session and never reaches the stock prompt. The pass key is exercised with the plugin tool (it has no side effect, so the
 * same call can be made again): S35's table of retries. One host with the settings fixtures and demo_echo asking in its body.
 *
 * | id     | technique | expected |
 * |--------|-----------|----------|
 * | SCP-01 | EP (set_plugin_enabled, unchecked tools) | at once; code waiting-for-approval; a card with a detail list naming the tools; no stock prompt; nothing turned on; Allow + retry turns the plugin on |
 * | SCP-02 | EP (a plugin tool asks in Fishball's session) | at once; the waiting text; a card for demo_echo with the exact arguments; no stock prompt |
 * | SCP-03 | DT (retry after Allow: changed value / same arguments, other key order / same call again) | changed `command`: new card; reordered: runs (outcome allowed-once), no card; the same call again: new card (the pass is one-time) |
 * | SCP-04 | EP (turning on one of Fishball's own plugins) | at once; card; no stock prompt; the feature stays off; Allow + retry turns it on |
 * | SCP-05 | EP (set_plugin_settings) | at once; card whose detail lists `path: old → new`; stored values unchanged and the plugin gets nothing; no stock prompt; no secret on the card |
 * | SCP-06 | ST (set_plugin_settings –Allow, retry→) | the retry saves {ok:true, changed}; no second card |
 * | SCP-07 | ST (set_plugin_settings –Reject→) | Fishball not woken; nothing saved; the next identical call asks again |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { API, CLICK, FIXTURE_BUNDLE, MANAGER_BUNDLES, MANAGER_ENV, OWN_ASKING_TOOL, OWN_PLUGINS, OWN_REQUEST, OWN_STATUS, SETTINGS_FIXTURE, SETTINGS_TOOLS } from './support/constants.mjs'
import { HOOK, T, assertNoSecret, cardOf, pluginIn, promptLine, settingsAudit, untilCatalog, userOf } from './support/expect.mjs'
import { QUIET_MS, cardArguments, detailEntries, ownCards, ownHost, ownTools, sleep, tokens } from './support/rev11f.mjs'

const LONG = { timeout: 180000 }
const SET = MANAGER_BUNDLES.settings
const MAIN = SET.rows.main
const names = tokens('SCP')

describe('rev11f: every kind of Fishball request is a card', () => {
  let ctx
  let t
  const user = () => userOf(ctx.host, SET.name, MAIN)

  before(async () => {
    ctx = await ownHost('rev11f-scope', { ...MANAGER_ENV, FBTEST_ASKING_TOOLS: OWN_ASKING_TOOL })
    t = ownTools(ctx, names)
    assert.equal((await ctx.host.post(API.plugins, { plugin: SET.name, on: true })).status, 200, 'precondition: fbtest-settings on')
    assert.ok(await untilCatalog(ctx.host, (c) => pluginIn(c, SET.name)?.applied === true, 10000), 'precondition: mounted')
  }, HOOK)
  after(async () => { await ctx?.host?.stop() }, HOOK)

  it('SCP-01 unchecked tools: a card with the tool list, no stock prompt; Allow and the retry turn the plugin on', LONG, async () => {
    const args = { plugin: FIXTURE_BUNDLE.name, on: true }
    const r = await t.call('set_plugin_enabled', args)
    assert.ok(r.took < 10000, 'at once')
    assert.equal(r.json?.ok, false, r.result.text)
    assert.equal(r.json.code, OWN_REQUEST.code)
    assert.ok(r.card, 'a card')
    assert.equal(r.card.toolName, 'set_plugin_enabled')
    const entries = detailEntries(r.card)
    assert.ok(entries?.length > 1, 'a detail list of tools: ' + JSON.stringify(r.card))
    assert.ok(entries.some((e) => e.includes(OWN_ASKING_TOOL)), 'names a tool of the plugin: ' + entries.join(' | '))
    assert.equal(await t.stockAsked(), 0, 'the stock prompt was not asked')
    const { retry } = await t.click(r.card.requestId, CLICK.allow, { retry: { tool: 'set_plugin_enabled', args, id: names.cid('01') } })
    assert.equal(retry.json?.ok, true, retry.text)
    assert.deepEqual(await ownCards(ctx), [], 'no second card')
  })

  it("SCP-02 a plugin tool that asks in Fishball's session returns at once with a card", LONG, async () => {
    const args = { text: 'fbtest', command: names.tok('c1') }
    const r = await t.call(OWN_ASKING_TOOL, args)
    assert.ok(t.isWaiting(r), r.result.text)
    assert.ok(r.took < 10000, 'at once')
    assert.ok(r.card, 'a card: ' + r.result.text)
    assert.equal(r.card.toolName, OWN_ASKING_TOOL)
    assert.deepEqual(cardArguments(r.card), args, 'the exact arguments')
    assert.equal(await t.stockAsked(), 0)
    await t.withdraw(r.card.requestId)
  })

  it('SCP-03 the retry: changed value asks again, another key order runs, a second use asks again', LONG, async () => {
    const command = names.tok('c3')
    const base = { text: 'fbtest', command }
    const r = await t.call(OWN_ASKING_TOOL, base)
    assert.ok(r.card, r.result.text)
    const ids = [names.cid('3a'), names.cid('3b'), names.cid('3c')]
    const { answer, retry } = await t.click(r.card.requestId, CLICK.allow, {
      retry: [
        { tool: OWN_ASKING_TOOL, args: { ...base, command: command + '-other' }, id: ids[0] },
        { tool: OWN_ASKING_TOOL, args: { command, text: 'fbtest' }, id: ids[1] },
        { tool: OWN_ASKING_TOOL, args: base, id: ids[2] },
      ],
    })
    assert.equal(answer.status, 200)
    assert.match(retry[0].text, OWN_REQUEST.waiting, 'changed value → a new card')
    assert.match(retry[1].text, /allowed-once/, 'same arguments in another key order → runs under the pass: ' + retry[1].text)
    assert.match(retry[2].text, OWN_REQUEST.waiting, 'the pass was used: the same call again → a new card')
    const cards = await ownCards(ctx)
    assert.equal(cards.length, 2, 'two new cards: ' + JSON.stringify(cards))
    assert.equal(await t.stockAsked(), 0)
    for (const c of cards) await t.withdraw(c.requestId)
  })

  it("SCP-04 turning on one of Fishball's own plugins (off) is a card, not a prompt", LONG, async () => {
    const spec = OWN_PLUGINS.messages
    assert.equal((await ctx.host.post(API.plugins, { plugin: spec.key, on: false })).status, 200)
    const args = { plugin: spec.key, on: true }
    const r = await t.call('set_plugin_enabled', args)
    assert.ok(t.isWaiting(r), r.result.text)
    assert.ok(r.card)
    assert.equal(await t.stockAsked(), 0)
    assert.equal((await ctx.host.state()).features[spec.feature], false, 'still off while the card waits')
    const { retry } = await t.click(r.card.requestId, CLICK.allow, { retry: { tool: 'set_plugin_enabled', args, id: names.cid('04') } })
    assert.equal(retry.json?.ok, true, retry.text)
    assert.equal((await ctx.host.state()).features[spec.feature], true, 'on after the retry')
  })

  const values = { limit: 8, nested: { a: 'z' } }
  const reasonOf = (label) => 'fbtest reason ' + names.tok(label)
  let setCard
  it('SCP-05 set_plugin_settings: a card whose detail lists path: old → new; nothing saved; no secret', LONG, async () => {
    const before = await user()
    const r = await t.call(SETTINGS_TOOLS.set, { plugin: SET.name, row: MAIN, values, reason: reasonOf('05') })
    assert.ok(t.isWaiting(r), r.result.text)
    assert.ok(r.took < 10000, 'at once')
    assert.ok(r.card)
    setCard = r.card
    const detail = (detailEntries(r.card) ?? []).join('\n')
    const limit = promptLine(detail, 'limit')
    assert.deepEqual(limit && { old: limit.old, new: limit.new }, { old: '3', new: '8' }, 'limit line:\n' + detail)
    const nested = promptLine(detail, 'nested.a')
    assert.deepEqual(nested && { old: nested.old, new: nested.new }, { old: '"x"', new: '"z"' }, 'nested.a line:\n' + detail)
    assertNoSecret(assert, JSON.stringify(r.card), 'the card')
    assert.deepEqual(await user(), before, 'nothing saved while the card waits')
    assert.equal(await t.stockAsked(), 0)
    assert.equal(settingsAudit(ctx.home, SET.name).length, 0, 'no audit row before the user decides')
  })

  it('SCP-07 Reject leaves everything as it was and does not wake Fishball; the same call asks again', LONG, async () => {
    const before = await user()
    const steps = await t.fbSteps()
    const { answer } = await t.click(setCard.requestId, CLICK.reject)
    assert.equal(answer.status, 200)
    await sleep(QUIET_MS)
    assert.equal(await t.fbSteps(), steps, 'no step started by the reject')
    assert.deepEqual(await user(), before, 'unchanged')
    assert.equal(await cardOf(ctx.host, setCard.requestId), undefined)
  })

  it('SCP-06 Allow once and the retry save the values; no second card', LONG, async () => {
    const before = await user()
    const args = { plugin: SET.name, row: MAIN, values, reason: reasonOf('06') }
    const r = await t.call(SETTINGS_TOOLS.set, args)
    assert.ok(r.card, r.result.text)
    const { retry } = await t.click(r.card.requestId, CLICK.allow, { retry: { tool: SETTINGS_TOOLS.set, args, id: names.cid('06') } })
    assert.equal(retry.json?.ok, true, retry.text)
    assert.ok(retry.json.changed?.length >= 2, JSON.stringify(retry.json))
    assert.notDeepEqual(await user(), before, 'the user-level values changed')
    assert.deepEqual(await ownCards(ctx), [], 'no second card')
    assert.equal(settingsAudit(ctx.home, SET.name).length >= 1, true, 'audited')
  })
})
