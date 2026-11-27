// Script core's settings and DSH's catalog and Settings launcher without running core.
import { DSH_PAGE } from 'fishball-test-helpers/scripted-page'
import { PAGE_MARK } from './brand.mjs'
import { uiPage } from './ui-page.mjs'

export const MODEL = Object.freeze({
  removedEntry: 'fishball-ui.model-dialog',
  removedHook: 'data-fishball-model-dialog',
  namespace: 'fishball-core',
  slots: Object.freeze([DSH_PAGE.slot.main, DSH_PAGE.slot.headerActions, 'shell.overlay']),
  dialogRoles: Object.freeze(['dialog', 'alertdialog']),
  dialogTag: 'dialog',
  langs: Object.freeze(['en', 'zh']),
  launcherClass: 'fishball-settings-launcher',
  launcherTag: 'button',
  click: 'click',
})

export const CATALOG = Object.freeze({
  wire: Object.freeze({
    default: Object.freeze({ provider: 'fishball-test', model: 'test-model' }), routableProviders: Object.freeze(['fishball-test']), failures: Object.freeze([]),
    groups: Object.freeze([Object.freeze({ id: 'fishball-test', name: 'Test Provider', models: Object.freeze([Object.freeze({ id: 'test-model', name: 'Wire Model Alpha' }), Object.freeze({ id: 'test-model-b', name: 'Wire Model Beta' })]) })]),
  }),
})
export const emptyCatalog = () => ({ ...CATALOG.wire, groups: [], routableProviders: [] })

export async function modelPage(t, { catalog = CATALOG.wire, lang, modelCatalog } = {}) {
  let launcherPresses = 0
  const session = { modelCatalog: modelCatalog ?? (async () => ({ ok: true, value: structuredClone(catalog) })), $on: () => () => {} }
  const p = await uiPage(t, {
    lang, modal: true, remoteSession: session, namespaces: { [MODEL.namespace]: {} },
    prepareWorld(world) {
      world.onDocument = (_document, dom) => {
        const launcher = dom.createElement(MODEL.launcherTag)
        launcher.className = MODEL.launcherClass
        launcher.addEventListener(MODEL.click, () => { launcherPresses += 1 })
        dom.body.append(launcher)
      }
      world.html.setAttribute(PAGE_MARK, '')
    },
  })
  const { world } = p
  for (const slot of MODEL.slots) await p.mountAll(slot + ':', slot)
  return {
    world, nodes: p.nodes,
    dialogs: () => p.nodes().filter((n) => MODEL.dialogRoles.includes(n.props.role) || n.tag === MODEL.dialogTag),
    get launcherPresses() { return launcherPresses },
    async openPage() { world.html.setAttribute(PAGE_MARK, ''); await p.settle() },
    async closePage() { world.html.removeAttribute(PAGE_MARK); await p.settle() },
  }
}
