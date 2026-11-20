/** The reported owner gesture, from a real Plugins page to an already-connected Fishball's public target view. */
import assert from 'node:assert/strict'
import { DSH_NAME } from '../../../tests/settings-page/constants.mjs'
import { MULTI as M } from '../../../tests/wire/multi-constants.mjs'
import { assertStandardIdentityHint, bothResources, eventually, identityNotices, observer } from '../../../tests/wire/multi-subject.mjs'
import { createToken } from '../../../tests/wire/review/steps.mjs'
import { multiWorld } from '../../../../../test/v3/fishball-core/wire/multi-world.mjs'
import { TARGETS, resolvedName } from '../../../../../test/v3/fishball-core/wire/targets-oracle.mjs'
import { SETTINGS } from './constants.mjs'
import { connectorWorld, openConnectorPage } from './world.mjs'

const field = `document.querySelector('[${SETTINGS.setting}="${M.refName}"] input')`
const enter = ['Enter', 13], tabKey = ['Tab', 9], erase = ['Backspace', 8]

export function registerRenameRow(sdk, row) {
  const open = multiWorld(sdk, { liveChild: true })
  row(sdk, DSH_NAME.id, 'R1B hosted', 'empty → Enter then move focus → cleared on blur; persisted settings and live identity agree, duplicate resolved only in Fishball', async (t) => {
    const { w } = await connectorWorld(sdk, 'rename', [])
    const token = await createToken(w)
    const fishball = await open({ child: { targetUrl: w.urls().resource }, handoff: token.value })
    const parent = TARGETS.parentId
    const connected = (target) => target.state === 'connected' && target.identity === 'live'
    const initial = await fishball.until(parent, connected, 'hosted parent connected and listening')
    const liveName = DSH_NAME.live + M.suffix
    const other = await fishball.connect(await fishball.fake({ name: liveName }))
    const stream = await observer(t, w, bothResources)
    const { tab, b } = await openConnectorPage(t, w)
    const editable = () => b.waitFor(tab, `!!${field} && !${field}.disabled && !${field}.readOnly`, undefined, 'the editable DSH name field')
    await editable()
    const saved = async () => (await w.settings()).value.approval?.dshName ?? ''
    assert.equal(await saved(), '')
    assert.equal(await tab.evaluate(`${field}.value`), '')
    // Catch a false alert even if a later host update removes it before the assertion.
    await tab.evaluate(`(() => {
      window.renameErrors = []; const read = () => { const row = ${field}?.closest('[${SETTINGS.setting}]').parentElement; for (const a of row?.querySelectorAll('[role=alert]') ?? []) if (a.innerText.trim()) window.renameErrors.push(a.innerText) };
      new MutationObserver(read).observe(document.body, {childList:true, subtree:true, characterData:true}); })()`)
    // The Plugins page may replace its initially editable form while the owner settings finish loading.
    await b.waitFor(tab, `(async () => { const input = ${field}; input?.focus(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return input && input === ${field} && input === document.activeElement })()`, undefined, 'the focused owner name input')
    await tab.type(DSH_NAME.live)
    assert.equal(await tab.evaluate(`${field} === document.activeElement && ${field}.value`), DSH_NAME.live, 'rename draft must be focused before Enter')
    await tab.key(...enter)
    await tab.key(...tabKey)
    assert.equal(await tab.evaluate(`${field} === document.activeElement`), false, 'focus did not leave the name field')
    async function verify(value, serverName, localName, notices) {
      await eventually(async () => (await saved()) === value, 'settings did not persist ' + JSON.stringify(value))
      await eventually(() => identityNotices(stream).length >= notices, 'the original listen stream received no identity hint')
      assertStandardIdentityHint(identityNotices(stream)[notices - 1])
      await fishball.until(parent, (v) => connected(v) && v.serverName === serverName && v.name === localName, 'live name ' + localName)
      assert.equal((await fishball.view(other.targetId)).name, liveName, 'the first name holder changed')
      await editable()
      assert.equal(await tab.evaluate(`${field}.value`), value)
      assert.deepEqual(await tab.evaluate('window.renameErrors'), [], 'false error for a persisted, live-pushed edit')
    }
    await verify(DSH_NAME.live, liveName, resolvedName(liveName, TARGETS.duplicate.firstSuffix), 1)
    await tab.evaluate(`${field}.focus(); ${field}.select()`)
    await tab.key(...erase)
    await tab.key(...tabKey)
    await verify('', initial.serverName, initial.name, 2)
  })
}
