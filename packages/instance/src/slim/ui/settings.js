/**
 * The instance's settings view (I6; design §0.5 "Settings view", §0.7, §18.2 I6).
 *
 * The custom page shows it at `?view=settings` (src/slim/ui/shell.js owns the switch). It has
 * three blocks: the status with Restart, the child's default model and reasoning effort from its
 * own catalog, and the child's plugins (installed, install by spec, the recommended list, and each
 * plugin's settings).
 *
 * It calls the kept admin routes `/api/fishball/native/admin/*` (src/slim/host/settings-routes.js)
 * and nothing else: the page is framed on the main origin, so those owner-only routes take the main
 * DSH's cookie, and the relay sends every operation but status and restart to the child's own admin
 * service (§0.7 "Admin routes"). The paths are absolute because the routes are the main DSH's, not
 * the child's. It shows no connector value and links to none (inst-OQ-05: the frame has Connector
 * settings), and it has no model-sync button (D26: that is on the instance's Plugins card).
 *
 * The view owns no admin state beyond what it last read: every change re-reads its block, and a
 * stale revision or inventory digest is a typed refusal the block shows with its code (R7). During
 * a restart every control is disabled and the status reads "Restarting…" until the shell reports
 * the page's stream connected again (inst-OQ-17).
 */

import { DEFAULT_I18N, LANG } from './i18n.js'

/** The admin routes' exact paths; keep the slugs in step with src/slim/host/settings-routes.js SLUGS. */
const ADMIN = Object.freeze({
  prefix: '/api/fishball/native/admin/',
  path: Object.freeze({
    status: 'status', restart: 'restart', modelGet: 'model/get', modelSet: 'model/set',
    pluginsGet: 'plugins/get', pluginInstall: 'plugin/install', pluginRemove: 'plugin/remove',
    pluginEnable: 'plugin/enable', pluginDisable: 'plugin/disable',
    settingsGet: 'settings/get', settingsMutate: 'settings/mutate',
  }),
  request: Object.freeze({ method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: Object.freeze({ 'content-type': 'application/json' }) }),
  // The page's own codes for an answer it could not read; the relay's codes come through as they are.
  failed: 'operation-failed',
  unreachable: 'unavailable',
})

/** The instance state the status block treats as running (src/slim/host/admin.js statusOutcome). */
const READY = 'ready'
/** The empty effort choice: the model's own default, sent as no `reasoningEffort` at all. */
const DEFAULT_EFFORT = ''

/**
 * The schema kinds a plugin's settings form draws (DSH's schemastery JSON envelope `{uid, refs}`,
 * as settings.describe() returns it). Anything else is shown read-only.
 */
const SCHEMA = Object.freeze({ object: 'object', intersect: 'intersect', string: 'string', number: 'number', boolean: 'boolean', union: 'union', constant: 'const', array: 'array', secretRole: 'secret' })
const FIELD_KIND = Object.freeze({ text: 'text', number: 'number', switch: 'switch', choice: 'choice', list: 'list', secret: 'secret', readOnly: 'read-only' })
/** A list field is one item per line. */
const LIST_SEPARATOR = '\n'
const SET_OP = 'set'
/** The admin's refusal for a revision or digest the page read before another writer changed it. */
const STALE = 'stale-revision'

const CLASS = Object.freeze({
  root: 'settings',
  block: 'settings-block',
  title: 'settings-title',
  subtitle: 'settings-subtitle',
  hint: 'settings-hint',
  row: 'settings-row',
  grow: 'settings-grow',
  field: 'settings-field',
  label: 'settings-label',
  input: 'settings-input',
  list: 'settings-list',
  item: 'settings-item',
  code: 'settings-code',
  tag: 'settings-tag',
  error: 'settings-error',
  status: 'settings-status',
  button: 'settings-button',
  primary: 'is-primary',
  readOnly: 'settings-readonly',
})

const ARIA = Object.freeze({ label: 'aria-label', role: 'role', status: 'status', alert: 'alert', live: 'aria-live', polite: 'polite' })

/** Dictionary key prefixes of the values a key is built from (ui/i18n.js `settings.*`). */
const KEY = Object.freeze({ state: 'settings.state.', category: 'settings.category.', namespace: 'settings.ns.', field: 'settings.field.' })

/**
 * One admin call. Always resolves to `{ok:true,result}` or `{ok:false,error:{code}}`, like the
 * relay itself; an answer the page cannot read is `operation-failed`, no answer `unavailable`.
 */
async function adminRequest(operation, payload = {}) {
  try {
    const response = await fetch(ADMIN.prefix + ADMIN.path[operation], { ...ADMIN.request, body: JSON.stringify(payload) })
    const answer = await response.json().catch(() => null)
    if (answer?.ok === true && answer.result !== undefined) return { ok: true, result: answer.result }
    return { ok: false, error: answer?.ok === false && typeof answer.error?.code === 'string' ? answer.error : { code: ADMIN.failed } }
  } catch { return { ok: false, error: { code: ADMIN.unreachable } } }
}

/**
 * Mount the settings view.
 *
 * @param {object} options
 * @param {Element} options.container - element the view is built in.
 * @param {object} [options.i18n] - the page's words (ui/i18n.js); English by default.
 * @returns {{ refresh: () => Promise<void>, connected: (on: boolean) => void }} `refresh` re-reads
 *   every block; `connected` is the shell's stream state, which ends a restart's "Restarting…".
 */
export function createSettingsView(options = {}) {
  const { container, i18n = DEFAULT_I18N } = options ?? {}
  const { t } = i18n
  if (!container || typeof container.append !== 'function' || typeof container.ownerDocument?.createElement !== 'function') {
    throw new TypeError('fishball settings: a container element is required')
  }
  const document = container.ownerDocument

  /**
   * A schema's own meta text (DSH's `schema.meta.title`/`description`): either a plain string
   * or one string per locale, as DSH's locale dictionaries write it.
   */
  function metaText(value) {
    if (typeof value === 'string') return value.trim() === '' ? undefined : value
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
    const text = value[i18n.lang] ?? value[LANG.en]
    return typeof text === 'string' && text.trim() !== '' ? text : undefined
  }

  /** DSH's technical-name fallback: drop the scope and the harness prefixes a module name carries. */
  function shortName(name) {
    return (name.startsWith('@') ? name.slice(name.indexOf('/') + 1) : name)
      .replace(/^cordis:/, '')
      .replace(/^cordis-plugin-/, '')
      .replace(/^dsh-(?:host-|client-)?/, '')
  }

  /** A schema key as words; camelCase splits too, so `reasoningEffort` reads `Reasoning effort`. */
  function humanizedKey(key) {
    return shortName(key)
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  /** The root node of a serialized schema envelope (`{uid, refs}`) or of a live node. */
  function schemaRoot(json) {
    if (json === null || typeof json !== 'object') return undefined
    return typeof json.uid === 'number' && json.refs?.[json.uid] !== undefined ? json.refs[json.uid] : json
  }

  /**
   * A settings label: the schema's own localized title, else the page dictionary, else a
   * readable form of the key. A schema that ships no metadata never shows a raw key.
   */
  function labelOf(meta, key, prefix) {
    return metaText(meta) ?? t(prefix + key) ?? humanizedKey(key)
  }

  /** One element with an optional class and text. */
  function el(tag, className, text) {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined) node.textContent = text
    return node
  }

  /** DSH's small button; `primary` is the block's main action (I8's primary/outline pair). */
  function button(text, onClick, { primary = false, label } = {}) {
    const node = el('button', CLASS.button + (primary ? ' ' + CLASS.primary : ''), text)
    node.type = 'button'
    if (label) node.setAttribute(ARIA.label, label)
    node.addEventListener('click', () => { void onClick() })
    return node
  }

  /** A labelled control in a column, the settings field look. */
  function labelled(caption, control) {
    const field = el('label', CLASS.field)
    field.append(el('span', CLASS.label, caption), control)
    return field
  }

  function selectOf(choices, value) {
    const select = el('select', CLASS.input)
    for (const [id, name] of choices) {
      const option = el('option', undefined, name)
      option.value = id
      select.append(option)
    }
    select.value = value
    return select
  }

  /**
   * One block: a heading, a hint, a body the block redraws, and one message line. Every
   * control a block draws is registered, so a restart can disable them all at once.
   */
  function block(title, ...hints) {
    const root = el('section', CLASS.block)
    const body = el('div')
    const message = el('p', CLASS.status)
    message.setAttribute(ARIA.role, ARIA.status)
    message.setAttribute(ARIA.live, ARIA.polite)
    message.hidden = true
    root.append(el('h2', CLASS.title, title), ...hints.map((hint) => el('p', CLASS.hint, hint)), body, message)
    return {
      root,
      body,
      /** Show a confirmation, or a refusal with its code (R7), or nothing. */
      say(text, error = false) {
        message.textContent = text ?? ''
        message.className = error ? CLASS.error : CLASS.status
        message.setAttribute(ARIA.role, error ? ARIA.alert : ARIA.status)
        message.hidden = !text
      },
      refuse(error) { this.say(t('settings.refused', { code: error.code }), true) },
    }
  }

  const root = el('div', CLASS.root)
  root.setAttribute(ARIA.label, t('settings.region'))
  container.append(root)

  /** While true, every control is disabled (inst-OQ-17); cleared when the stream reconnects. */
  let restarting = false
  let restartAnswered = false
  /** Disable or enable every control of the view. */
  function lock() {
    for (const control of root.querySelectorAll('button, select, input, textarea')) control.disabled = restarting || control.dataset.locked === 'true'
  }
  /** Mark a control that its own block keeps disabled, whatever the restart state. */
  function keep(control, disabled) {
    control.dataset.locked = String(disabled)
    control.disabled = restarting || disabled
    return control
  }

  /* ------------------------------------------------------------ status */

  const status = block(t('settings.statusTitle'), t('settings.statusHint'))
  async function loadStatus() {
    const answer = await adminRequest('status')
    if (!answer.ok) { status.refuse(answer.error); return }
    drawStatus(answer.result)
  }
  function drawStatus({ state, code }) {
    const line = el('div', CLASS.row)
    line.append(el('span', CLASS.tag, restarting ? t('settings.restarting') : (t(KEY.state + state) ?? state)))
    if (code) line.append(el('code', CLASS.code, code))
    line.append(button(restarting ? t('settings.restarting') : t('settings.restart'), restart))
    status.body.replaceChildren(line)
    lock()
  }
  async function restart() {
    restarting = true
    restartAnswered = false
    status.say(null)
    drawStatus({ state: null, code: null })
    const answer = await adminRequest('restart')
    restartAnswered = true
    if (!answer.ok) {
      // A refused restart leaves the instance as it is: nothing will reconnect, so unlock now.
      restarting = false
      status.refuse(answer.error)
      await refresh()
      return
    }
    // The relay answers once the start has run. A child that did not come up ready will not
    // reconnect the page's stream, so the restart ends here with its state; a ready child ends
    // it here too when the stream is already back, otherwise on the reconnect (connected()).
    if (streamConnected || answer.result.state !== READY) { restarting = false; await refresh() }
    else drawStatus(answer.result)
  }

  /* ------------------------------------------------------------ model */

  const model = block(t('settings.modelTitle'), t('settings.modelHint'), t('settings.modelSyncHint'))
  async function loadModel() {
    const answer = await adminRequest('modelGet')
    if (!answer.ok) { model.refuse(answer.error); model.body.replaceChildren(); return }
    drawModel(answer.result, answer.result.selection)
  }
  /**
   * The pickers over the child's catalog. `selection` is the draft: a provider change picks that
   * provider's first model, and a model change keeps the effort only when the new model offers it.
   */
  function drawModel(snapshot, selection) {
    const offered = snapshot.models.filter((entry) => entry.provider === selection.provider)
    const chosen = offered.find((entry) => entry.id === selection.model)
    const providerName = (id) => snapshot.providers.find((entry) => entry.id === id)?.name ?? id
    // The live session's model, when the child's chat has one. A stale saved default is shown
    // beside it so the page never claims Fishball runs what it actually does not.
    const active = snapshot.active ?? null
    const activeModel = active === null ? undefined : snapshot.models.find((entry) => entry.provider === active.provider && entry.id === active.model)
    const activeDiffers = active !== null && (active.provider !== selection.provider || active.model !== selection.model)
    const activeName = activeModel?.name ?? `${active?.provider ?? ''} / ${active?.model ?? ''}`
    const redraw = (next) => { model.say(null); drawModel(snapshot, next) }
    const provider = selectOf(snapshot.providers.map((entry) => [entry.id, entry.name]), selection.provider)
    provider.addEventListener('change', () => {
      const first = snapshot.models.find((entry) => entry.provider === provider.value)
      redraw({ provider: provider.value, model: first?.id ?? '' })
    })
    const modelSelect = selectOf(offered.map((entry) => [entry.id, entry.name]), selection.model)
    modelSelect.addEventListener('change', () => {
      const next = offered.find((entry) => entry.id === modelSelect.value)
      const keepEffort = next?.efforts.some((effort) => effort.id === selection.reasoningEffort) === true
      redraw({ provider: selection.provider, model: modelSelect.value, ...(keepEffort ? { reasoningEffort: selection.reasoningEffort } : {}) })
    })
    const fields = [labelled(t('settings.provider'), provider), labelled(t('settings.model'), modelSelect)]
    const efforts = chosen?.efforts ?? []
    if (efforts.length > 0) {
      const effort = selectOf([[DEFAULT_EFFORT, t('settings.effortDefault')], ...efforts.map((entry) => [entry.id, entry.name])], selection.reasoningEffort ?? DEFAULT_EFFORT)
      effort.addEventListener('change', () => {
        const { reasoningEffort: _dropped, ...rest } = selection
        redraw(effort.value === DEFAULT_EFFORT ? rest : { ...rest, reasoningEffort: effort.value })
      })
      fields.push(labelled(t('settings.effort'), effort))
    }
    const row = el('div', CLASS.row)
    row.append(...fields)
    const dirty = JSON.stringify(selection) !== JSON.stringify(snapshot.selection)
    const save = keep(button(t('settings.save'), async () => {
      save.textContent = t('settings.saving')
      keep(save, true)
      const answer = await adminRequest('modelSet', { revision: snapshot.revision, provider: selection.provider, model: selection.model, ...(selection.reasoningEffort === undefined ? {} : { reasoningEffort: selection.reasoningEffort }) })
      // A stale revision reloads the child's current selection instead of keeping the draft over it.
      if (answer.error?.code === STALE) { await loadModel(); model.say(t('settings.stale'), true); return }
      if (!answer.ok) { model.refuse(answer.error); drawModel(snapshot, selection); return }
      const next = { ...snapshot, revision: answer.result.revision, selection: answer.result.selection }
      drawModel(next, next.selection)
      model.say(answer.result.sessionError ? t('settings.modelSavedNotApplied') : t('settings.modelSaved'))
    }, { primary: true }), chosen === undefined || !dirty)
    const notes = []
    if (chosen === undefined) {
      const providerKnown = snapshot.providers.some((entry) => entry.id === selection.provider)
      if (!providerKnown) notes.push(el('p', CLASS.hint, t('settings.modelProviderUnknown', { provider: selection.provider })))
      else if (offered.length === 0) notes.push(el('p', CLASS.hint, t('settings.modelCatalogEmpty', { provider: providerName(selection.provider) })))
      else notes.push(el('p', CLASS.hint, t('settings.modelUnknown', { provider: providerName(selection.provider), model: selection.model })))
      if (activeDiffers) notes.push(el('p', CLASS.hint, t('settings.modelRunning', { provider: providerName(active.provider), model: activeName })))
    }
    const actions = el('div', CLASS.row)
    actions.append(save, button(t('settings.reload'), loadModel))
    if (chosen === undefined && activeDiffers && activeModel !== undefined) {
      // The running model is only a draft: the person still presses Save, so the stored default
      // is never silently rewritten.
      actions.append(button(t('settings.useRunningModel'), () => {
        const keepEffort = active.reasoningEffort !== undefined && activeModel.efforts.some((effort) => effort.id === active.reasoningEffort)
        redraw({ provider: active.provider, model: active.model, ...(keepEffort ? { reasoningEffort: active.reasoningEffort } : {}) })
      }))
    }
    model.body.replaceChildren(row, ...notes, actions)
    lock()
  }

  /* ------------------------------------------------------------ plugins */

  const plugins = block(t('settings.pluginsTitle'), t('settings.pluginsHint'))
  async function loadPlugins() {
    const answer = await adminRequest('pluginsGet')
    if (!answer.ok) { plugins.refuse(answer.error); plugins.body.replaceChildren(); return }
    drawPlugins(answer.result)
  }
  /** One plugin change with the inventory digest the page read; a success re-reads the list. */
  async function changePlugin(operation, payload) {
    plugins.say(null)
    for (const control of plugins.body.querySelectorAll('button, input')) keep(control, true)
    const answer = await adminRequest(operation, payload)
    await loadPlugins()
    if (answer.ok) plugins.say(t('settings.pluginDone'))
    else if (answer.error.code === STALE) plugins.say(t('settings.stale'), true)
    else plugins.refuse(answer.error)
  }
  function drawPlugins({ inventoryRevision, bundles, recommended = [] }) {
    const installedNames = new Set(bundles.map((bundle) => bundle.name))
    const install = (spec) => changePlugin('pluginInstall', { inventoryRevision, spec })
    const list = el('ul', CLASS.list)
    for (const bundle of bundles) {
      const item = el('li', CLASS.item)
      const name = el('span', CLASS.grow)
      name.append(el('code', CLASS.code, bundle.name), ...(bundle.version ? [el('span', CLASS.hint, ' ' + bundle.version)] : []))
      item.append(name)
      // Only a package this profile installed can change (src/slim/child/admin.js manageable()).
      if (bundle.removable && bundle.installed) {
        const toggle = el('input')
        toggle.type = 'checkbox'
        toggle.checked = bundle.enabled
        toggle.setAttribute(ARIA.label, t('settings.pluginToggle', { name: bundle.name }))
        toggle.addEventListener('change', () => { void changePlugin(toggle.checked ? 'pluginEnable' : 'pluginDisable', { inventoryRevision, name: bundle.name }) })
        item.append(labelled(t('settings.enabled'), toggle),
          button(t('settings.remove'), () => changePlugin('pluginRemove', { inventoryRevision, name: bundle.name }), { label: t('settings.removeLabel', { name: bundle.name }) }))
      } else item.append(el('span', CLASS.tag, t('settings.core')))
      list.append(item)
    }
    const spec = el('input', CLASS.input)
    spec.type = 'text'
    spec.setAttribute(ARIA.label, t('settings.installSpec'))
    const installButton = keep(button(t('settings.install'), () => install(spec.value.trim()), { primary: true }), true)
    spec.addEventListener('input', () => keep(installButton, spec.value.trim() === ''))
    const installRow = el('div', CLASS.row)
    installRow.append(spec, installButton)
    const categories = []
    for (const entry of recommended) {
      let group = categories.find((candidate) => candidate.category === entry.category)
      if (group === undefined) { group = { category: entry.category, entries: [] }; categories.push(group) }
      group.entries.push(entry)
    }
    const recommendedNodes = categories.flatMap(({ category, entries }) => {
      const rows = el('ul', CLASS.list)
      for (const entry of entries) {
        const item = el('li', CLASS.item)
        item.append(el('code', CLASS.code + ' ' + CLASS.grow, entry.packageName),
          installedNames.has(entry.packageName) ? el('span', CLASS.tag, t('settings.installed'))
            : button(t('settings.install'), () => install(entry.spec), { label: t('settings.installLabel', { name: entry.packageName }) }))
        rows.append(item)
      }
      return [el('h4', CLASS.label, t(KEY.category + category) ?? category), rows]
    })
    plugins.body.replaceChildren(
      el('h3', CLASS.subtitle, t('settings.installed')),
      bundles.length === 0 ? el('p', CLASS.hint, t('settings.noPlugins')) : list,
      el('h3', CLASS.subtitle, t('settings.installTitle')), el('p', CLASS.hint, t('settings.installHint')), installRow,
      el('h3', CLASS.subtitle, t('settings.recommendedTitle')), el('p', CLASS.hint, t('settings.recommendedHint')), ...recommendedNodes)
    lock()
  }

  /* ------------------------------------------------------------ plugin settings */

  const settings = block(t('settings.settingsTitle'), t('settings.settingsHint'))
  async function loadSettings() {
    const answer = await adminRequest('settingsGet')
    if (!answer.ok) { settings.refuse(answer.error); settings.body.replaceChildren(); return }
    const { writable, namespaces } = answer.result
    const notice = !writable ? t('settings.settingsReadOnly') : namespaces.length === 0 ? t('settings.settingsNone') : null
    settings.body.replaceChildren(...(notice ? [el('p', CLASS.hint, notice)] : []),
      ...(writable ? namespaces.map(namespaceForm) : []))
    lock()
  }

  /** The fields of a schema envelope, in declaration order, each with the way the form draws it. */
  function formFields(json) {
    const node = (ref) => (typeof ref === 'object' ? ref : json?.refs?.[ref])
    const kindOf = (field) => {
      if (field.meta?.role === SCHEMA.secretRole) return FIELD_KIND.secret
      if (field.type === SCHEMA.string) return FIELD_KIND.text
      if (field.type === SCHEMA.number) return FIELD_KIND.number
      if (field.type === SCHEMA.boolean) return FIELD_KIND.switch
      if (field.type === SCHEMA.union && (field.list ?? []).length > 0 && field.list.every((ref) => node(ref)?.type === SCHEMA.constant)) return FIELD_KIND.choice
      if (field.type === SCHEMA.array && [SCHEMA.string, SCHEMA.number].includes(node(field.inner)?.type)) return FIELD_KIND.list
      return FIELD_KIND.readOnly
    }
    const walk = (ref, path) => {
      const field = node(ref)
      if (!field || field.meta?.hidden) return []
      if (field.type === SCHEMA.object) return Object.entries(field.dict ?? {}).flatMap(([key, inner]) => walk(inner, [...path, key]))
      if (field.type === SCHEMA.intersect) return (field.list ?? []).flatMap((inner) => walk(inner, path))
      // A section root that is not an object would be a wholesale write, which the admin refuses.
      const kind = path.length === 0 ? FIELD_KIND.readOnly : kindOf(field)
      return [{
        path, kind,
        title: metaText(field.meta?.title),
        description: metaText(field.meta?.description),
        numbers: kind === FIELD_KIND.list && node(field.inner)?.type === SCHEMA.number,
        choices: kind === FIELD_KIND.choice ? field.list.map((choice) => node(choice).value) : undefined,
      }]
    }
    return walk(json?.uid ?? json, [])
  }

  const valueAt = (value, path) => path.reduce((at, key) => (at === null || at === undefined ? undefined : at[key]), value)

  /**
   * One field's control and its reader. The reader answers `{changed: false}` when the user left
   * it as drawn, `{changed: true, value}` for a valid edit and `{changed: true, invalid: true}`
   * otherwise. An empty secret keeps the stored one.
   */
  function fieldControl(field, current, secrets) {
    const key = JSON.stringify(field.path)
    if (field.kind === FIELD_KIND.switch) {
      const input = el('input')
      input.type = 'checkbox'
      input.checked = current === true
      return { control: input, read: () => (input.checked === (current === true) ? { changed: false } : { changed: true, value: input.checked }) }
    }
    if (field.kind === FIELD_KIND.choice) {
      const index = Math.max(0, field.choices.findIndex((choice) => choice === current))
      const select = selectOf(field.choices.map((choice, at) => [String(at), String(choice)]), String(index))
      return { control: select, read: () => (select.value === String(index) ? { changed: false } : { changed: true, value: field.choices[Number(select.value)] }) }
    }
    if (field.kind === FIELD_KIND.list) {
      const area = el('textarea', CLASS.input)
      const drawn = Array.isArray(current) ? current.join(LIST_SEPARATOR) : ''
      area.value = drawn
      return {
        control: area,
        hint: t('settings.listHint'),
        read: () => {
          if (area.value === drawn) return { changed: false }
          const items = area.value.split(LIST_SEPARATOR).map((item) => item.trim()).filter((item) => item !== '')
          if (!field.numbers) return { changed: true, value: items }
          const numbers = items.map(Number)
          return numbers.every(Number.isFinite) ? { changed: true, value: numbers } : { changed: true, invalid: true }
        },
      }
    }
    if (field.kind === FIELD_KIND.readOnly) {
      return { control: el('pre', CLASS.readOnly, JSON.stringify(current ?? null, null, 2)), hint: t('settings.readOnlyField'), read: () => ({ changed: false }) }
    }
    const input = el('input', CLASS.input)
    if (field.kind === FIELD_KIND.secret) {
      // The admin never sends a secret, only whether it is set; the field is write-only.
      input.type = 'password'
      const set = secrets.some((slot) => JSON.stringify(slot.path) === key && slot.set)
      return { control: input, hint: set ? t('settings.secretSet') : t('settings.secretUnset'), read: () => (input.value === '' ? { changed: false } : { changed: true, value: input.value }) }
    }
    input.type = 'text'
    const drawn = current === undefined || current === null ? '' : String(current)
    input.value = drawn
    return {
      control: input,
      read: () => {
        if (input.value === drawn) return { changed: false }
        if (field.kind === FIELD_KIND.text) return { changed: true, value: input.value }
        const number = Number(input.value.trim())
        return input.value.trim() !== '' && Number.isFinite(number) ? { changed: true, value: number } : { changed: true, invalid: true }
      },
    }
  }

  /**
   * One namespace's form. Save sends its revision and one `set` op per changed field; a refusal
   * keeps the edits and shows the code, a success re-reads every namespace (their revisions are
   * independent, and the re-read is the page's only copy of them).
   */
  function namespaceForm(entry) {
    const section = el('div', CLASS.block)
    section.append(el('h3', CLASS.subtitle, labelOf(schemaRoot(entry.schema)?.meta?.title, entry.ns, KEY.namespace)))
    const readers = formFields(entry.schema).map((field) => {
      const { control, hint, read } = fieldControl(field, valueAt(entry.value, field.path), entry.secrets)
      const path = field.path.join('.')
      const caption = field.title ?? t(KEY.field + path) ?? t(KEY.field + field.path[field.path.length - 1]) ?? humanizedKey(field.path[field.path.length - 1] ?? entry.ns)
      const node = labelled(caption, control)
      for (const text of [field.description, hint]) if (text) node.append(el('span', CLASS.hint, text))
      section.append(node)
      return { field, read }
    })
    const message = el('p', CLASS.status)
    message.hidden = true
    const say = (text, error) => { message.textContent = text; message.className = error ? CLASS.error : CLASS.status; message.hidden = false }
    const save = button(t('settings.save'), async () => {
      const ops = []
      for (const { field, read } of readers) {
        const answer = read()
        if (!answer.changed) continue
        if (answer.invalid) { say(t('settings.settingsInvalid'), true); return }
        ops.push({ op: SET_OP, path: field.path, value: answer.value })
      }
      if (ops.length === 0) return
      save.textContent = t('settings.saving')
      keep(save, true)
      const answer = await adminRequest('settingsMutate', { ns: entry.ns, revision: entry.revision, ops })
      // A stale revision is never retried over the other writer: the forms are re-read and the
      // user is told, so they review the current values before saving again.
      if (answer.error?.code === STALE) { await loadSettings(); settings.say(t('settings.stale'), true); return }
      if (!answer.ok) { save.textContent = t('settings.save'); keep(save, false); say(t('settings.refused', { code: answer.error.code }), true); return }
      await loadSettings()
      settings.say(t('settings.settingsSaved'))
    }, { primary: true })
    section.append(save, message)
    return section
  }

  root.append(status.root, model.root, plugins.root, settings.root)

  async function refresh() {
    for (const each of [status, model, plugins, settings]) each.say(null)
    await Promise.all([loadStatus(), loadModel(), loadPlugins(), loadSettings()])
  }

  let streamConnected = true
  /**
   * The shell's stream state. A restart drops the stream; its reconnect after the restart answered
   * ends "Restarting…" and re-reads every block.
   */
  function connected(on) {
    streamConnected = on
    if (on && restarting && restartAnswered) { restarting = false; void refresh() }
  }

  void refresh()
  return Object.freeze({ refresh, connected })
}
