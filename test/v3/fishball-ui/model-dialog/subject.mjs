/** Reuse the public DSH-page model. Client scripts/chunks execute unread in browser-sandbox. */
import { createWorld, loadPage, settle } from '../../fishball-core/settings/page.mjs'
import { STAND_IN } from '../../fishball-core/settings/primitives.mjs'
import { findAll, textOf } from '../../../support/rp-recommend.mjs'
import { U } from './constants.mjs'

/**
 * A stand-in for DSH's `Modal` primitive over the settings page's generic one: that one renders
 * every prop as an attribute of a plain div, so `title`, `description` and `footer` never reach the
 * tree and nothing has a dialog role. This one follows Modal's props (`open`, `onClose`, `title`,
 * `description`, `footer`, `closeLabel`): nothing while closed; open, a dialog with the title, the
 * description, the children, the footer and a close button that calls `onClose`.
 * It wraps the page's `createElement` before the page loads, because the primitives module binds it then.
 */
function withModal(React) {
  const create = React.createElement
  React.createElement = function createElement(type, props, ...children) {
    if (type !== U.modal.div || props?.[STAND_IN.primitive] !== U.modal.primitive) return create(type, props, ...children)
    const { open, onClose, title, description, footer, closeLabel, [STAND_IN.primitive]: primitive, ...rest } = props
    if (!open) return null
    return create(U.modal.div, { ...rest, role: U.modal.role, [STAND_IN.primitive]: primitive },
      title === undefined ? null : create(U.modal.heading, null, title),
      description === undefined ? null : create(U.modal.text, null, description),
      ...children, footer ?? null,
      create(U.button, { type: U.button, onClick: () => onClose?.() }, closeLabel))
  }
}

export async function page(t, sdk, { model, catalog = U.catalog, lang = U.lang[U.first] } = {}) {
  const w = createWorld({ sdk, lang, core: model ? { model } : {} })
  withModal(w.React)
  const session = { modelCatalog: async () => ({ ok: true, value: structuredClone(catalog) }), $on: () => () => {} }
  // The settings page's `remote` is a Proxy without a set trap that answers every namespace with a
  // "not faked" face, so an assignment never reaches a reader: wrap it so `remote.session` is ours.
  const remote = w.services.remote
  w.services.remote = new Proxy({}, { get: (_t, name) => (name === 'session' ? session : remote[name]) })
  w.services['remote.session'] = session
  w.provided.push('remote.session')
  const p = await loadPage(t, w)
  // Mount the slots declared by DSH; page-open dialogs may be portal children of any main entry.
  for (const slot of U.slots) for (const entry of w.entries(slot)) {
    const key = slot + ':' + (entry.options.key ?? entry.options.id)
    w.shim.mount(key, () => w.renderEntry(entry))
  }
  await settle()
  const nodes = () => findAll(w.shim.tree(), () => true)
  return { world: w, nodes, text: () => w.shim.tree().map(textOf).join(U.emptyText),
    dialogs: () => nodes().filter((n) => U.dialogs.includes(n.props.role) || n.tag === U.dialogs[U.first]),
    // The dialog's own controls: the page's header actions (now mounted too) also say "settings".
    buttons: () => findAll(nodes().filter((n) => U.dialogs.includes(n.props.role) || n.tag === U.dialogs[U.first]), () => true).filter((n) => n.tag === U.button),
    async press(node) { if (!node) throw new Error('Missing public control'); await p.press(node) },
    async choose(name) {
      const direct = nodes().find((n) => n.tag === U.button && textOf(n).includes(name))
      if (direct) return p.press(direct)
      const option = nodes().find((n) => n.tag === U.option && textOf(n).includes(name))
      const select = nodes().find((n) => n.tag === U.chooser)
      if (!option || !select) throw new Error('No model selection control for ' + name)
      select.props.onChange({ target: { value: option.props.value }, currentTarget: { value: option.props.value } })
      await settle()
      const save = nodes().find((n) => n.tag === U.button && /save|choose|confirm|select|保存|选择|确认/i.test(textOf(n)))
      if (save) await p.press(save)
    },
  }
}
export async function firstFrame(h, lang) {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), U.timeout)
  try {
    const r = await fetch(h.origin + U.route.strip + lang, { headers: { cookie: h.cookie }, signal: abort.signal })
    let buffer = U.emptyText
    for await (const data of r.body) {
      buffer += new TextDecoder().decode(data)
      const match = /(?:^|\n)data:\s*([^\n]+)\r?\n/.exec(buffer)
      if (match) return { status: r.status, contentType: r.headers.get('content-type'), frame: JSON.parse(match[U.one]) }
    }
    throw new Error('SSE ended before its immediate first frame')
  } finally { clearTimeout(timer); abort.abort() }
}
/** The status of an owner GET, its body (an SSE stream when served) abandoned once the head arrives. */
export async function routeStatus(h, route) {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), U.timeout)
  try { return (await fetch(h.origin + route, { headers: { cookie: h.cookie }, signal: abort.signal })).status } finally { clearTimeout(timer); abort.abort() }
}
