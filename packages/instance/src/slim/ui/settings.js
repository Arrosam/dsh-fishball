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

/**
 * Every string of the view, in English and Chinese (D30). I9 moves them into the page's
 * dictionaries; until then the variant follows the same rule: the page URL's first `lang`
 * parameter, exactly `zh` for Chinese, anything else English.
 */
const COPY = Object.freeze({
  en: Object.freeze({
    region: 'Fishball settings',
    statusTitle: 'Status',
    statusHint: 'Restart stops Fishball\'s private instance and starts it again; its own home and settings are kept.',
    restart: 'Restart',
    restarting: 'Restarting…',
    loading: 'Loading…',
    reload: 'Reload',
    save: 'Save',
    saving: 'Saving…',
    state: Object.freeze({ disabled: 'disabled', waiting: 'waiting', starting: 'starting', ready: 'running', stopping: 'stopping', stopped: 'stopped', failed: 'failed', 'connector-missing': 'connector missing' }),
    modelTitle: 'Model',
    modelHint: 'Fishball\'s default model and reasoning effort, from its own catalog. A change applies to its next request and does not change the model your other sessions use.',
    modelSyncHint: 'New models from DSH are added from Fishball instance → Model for Fishball in DSH\'s Plugins.',
    provider: 'Provider',
    model: 'Model',
    effort: 'Reasoning effort',
    effortDefault: 'Model default',
    modelUnknown: 'The saved model is not in the current catalog. Choose another model to change it.',
    modelSaved: 'Saved. Fishball uses it from its next request.',
    modelSavedNotApplied: 'Saved as the default. The live chat could not take it now; its next request may still use the previous model.',
    pluginsTitle: 'Plugins',
    pluginsHint: 'Installed in Fishball\'s own profile; nothing here changes DSH\'s plugins.',
    installed: 'Installed',
    noPlugins: 'No plugins are installed in Fishball.',
    enabled: 'On',
    core: 'Core',
    pluginToggle: (name) => `Use ${name} in Fishball`,
    remove: 'Uninstall',
    removeLabel: (name) => `Uninstall ${name} from Fishball`,
    installTitle: 'Install a plugin',
    installHint: 'A package name with an optional version, a Git address, a tarball URL or an absolute folder path.',
    installSpec: 'Package spec',
    install: 'Install',
    installLabel: (name) => `Install ${name} for Fishball`,
    recommendedTitle: 'Recommended plugins',
    recommendedHint: 'A fixed list chosen for Fishball. Installing one changes only Fishball\'s profile.',
    category: Object.freeze({ context: 'Context management', memory: 'Memory', channel: 'Channel', pet: 'Pet' }),
    pluginDone: 'Done.',
    settingsTitle: 'Plugin settings',
    settingsHint: 'The settings Fishball\'s own plugins publish. Each Save sends the revision this page read, so a change made elsewhere is refused instead of overwritten.',
    settingsReadOnly: 'Fishball stores settings read-only, so they cannot be changed here.',
    settingsNone: 'No plugin in Fishball publishes a setting.',
    settingsSaved: 'Saved.',
    stale: 'This changed elsewhere since the page read it, so nothing was written. The current values were reloaded; review them and save again.',
    settingsInvalid: 'A value is not valid for its field.',
    secretSet: 'Set; type a new value to replace it.',
    secretUnset: 'Not set.',
    listHint: 'One item per line.',
    readOnlyField: 'Shown only; it cannot be changed here.',
    refused: (code) => `Refused: ${code}`,
  }),
  zh: Object.freeze({
    region: 'Fishball 设置',
    statusTitle: '状态',
    statusHint: '重启会停止 Fishball 的私有实例并再次启动；它自己的主目录和设置会保留。',
    restart: '重启',
    restarting: '正在重启…',
    loading: '正在读取…',
    reload: '重新读取',
    save: '保存',
    saving: '保存中…',
    state: Object.freeze({ disabled: '已禁用', waiting: '等待中', starting: '启动中', ready: '运行中', stopping: '停止中', stopped: '已停止', failed: '失败', 'connector-missing': '缺少连接器' }),
    modelTitle: '模型',
    modelHint: 'Fishball 的默认模型和推理强度，来自它自己的模型目录。更改会在它的下一次请求生效，不会改变你其他会话使用的模型。',
    modelSyncHint: 'DSH 中的新模型请在 DSH 的插件页面 → Fishball instance → Model for Fishball 中添加。',
    provider: '提供商',
    model: '模型',
    effort: '推理强度',
    effortDefault: '模型默认',
    modelUnknown: '已保存的模型不在当前目录中。要更改请选择另一个模型。',
    modelSaved: '已保存。Fishball 会在下一次请求使用它。',
    modelSavedNotApplied: '已保存为默认值。当前聊天未能立即采用；它的下一次请求可能仍使用此前的模型。',
    pluginsTitle: '插件',
    pluginsHint: '安装在 Fishball 自己的配置中；此处不会改变 DSH 的插件。',
    installed: '已安装',
    noPlugins: 'Fishball 中尚未安装插件。',
    enabled: '开启',
    core: '核心',
    pluginToggle: (name) => `在 Fishball 中使用 ${name}`,
    remove: '卸载',
    removeLabel: (name) => `从 Fishball 卸载 ${name}`,
    installTitle: '安装插件',
    installHint: '包名（可带版本）、Git 地址、压缩包 URL 或绝对文件夹路径。',
    installSpec: '包规格',
    install: '安装',
    installLabel: (name) => `为 Fishball 安装 ${name}`,
    recommendedTitle: '推荐插件',
    recommendedHint: '为 Fishball 选定的固定列表。安装只改 Fishball 的配置。',
    category: Object.freeze({ context: '上下文管理', memory: '记忆', channel: '渠道', pet: '宠物' }),
    pluginDone: '已完成。',
    settingsTitle: '插件设置',
    settingsHint: 'Fishball 自己的插件公开的设置。每次保存都会发送本页读取的修订号，因此在别处发生的更改会被拒绝，不会被覆盖。',
    settingsReadOnly: 'Fishball 以只读方式存储设置，因此不能在这里修改。',
    settingsNone: 'Fishball 中没有插件公开设置。',
    settingsSaved: '已保存。',
    stale: '自本页读取以来这里已在别处更改，因此没有写入任何内容。已重新读取当前值；请检查后再次保存。',
    settingsInvalid: '有值不符合其字段。',
    secretSet: '已设置；输入新值可替换。',
    secretUnset: '未设置。',
    listHint: '每行一项。',
    readOnlyField: '仅显示，不能在这里修改。',
    refused: (code) => `已拒绝：${code}`,
  }),
})
/** D30's rule: the first `lang` parameter, exactly `zh`, selects Chinese. */
const LANG = Object.freeze({ param: 'lang', zh: 'zh' })

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
 * @returns {{ refresh: () => Promise<void>, connected: (on: boolean) => void }} `refresh` re-reads
 *   every block; `connected` is the shell's stream state, which ends a restart's "Restarting…".
 */
export function createSettingsView(options = {}) {
  const { container } = options ?? {}
  if (!container || typeof container.append !== 'function' || typeof container.ownerDocument?.createElement !== 'function') {
    throw new TypeError('fishball settings: a container element is required')
  }
  const document = container.ownerDocument
  const copy = new URLSearchParams(document.location.search).get(LANG.param) === LANG.zh ? COPY.zh : COPY.en

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
      refuse(error) { this.say(copy.refused(error.code), true) },
    }
  }

  const root = el('div', CLASS.root)
  root.setAttribute(ARIA.label, copy.region)
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

  const status = block(copy.statusTitle, copy.statusHint)
  async function loadStatus() {
    const answer = await adminRequest('status')
    if (!answer.ok) { status.refuse(answer.error); return }
    drawStatus(answer.result)
  }
  function drawStatus({ state, code }) {
    const line = el('div', CLASS.row)
    line.append(el('span', CLASS.tag, restarting ? copy.restarting : (copy.state[state] ?? state)))
    if (code) line.append(el('code', CLASS.code, code))
    line.append(button(restarting ? copy.restarting : copy.restart, restart))
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

  const model = block(copy.modelTitle, copy.modelHint, copy.modelSyncHint)
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
    const fields = [labelled(copy.provider, provider), labelled(copy.model, modelSelect)]
    const efforts = chosen?.efforts ?? []
    if (efforts.length > 0) {
      const effort = selectOf([[DEFAULT_EFFORT, copy.effortDefault], ...efforts.map((entry) => [entry.id, entry.name])], selection.reasoningEffort ?? DEFAULT_EFFORT)
      effort.addEventListener('change', () => {
        const { reasoningEffort: _dropped, ...rest } = selection
        redraw(effort.value === DEFAULT_EFFORT ? rest : { ...rest, reasoningEffort: effort.value })
      })
      fields.push(labelled(copy.effort, effort))
    }
    const row = el('div', CLASS.row)
    row.append(...fields)
    const dirty = JSON.stringify(selection) !== JSON.stringify(snapshot.selection)
    const save = keep(button(copy.save, async () => {
      save.textContent = copy.saving
      keep(save, true)
      const answer = await adminRequest('modelSet', { revision: snapshot.revision, provider: selection.provider, model: selection.model, ...(selection.reasoningEffort === undefined ? {} : { reasoningEffort: selection.reasoningEffort }) })
      // A stale revision reloads the child's current selection instead of keeping the draft over it.
      if (answer.error?.code === STALE) { await loadModel(); model.say(copy.stale, true); return }
      if (!answer.ok) { model.refuse(answer.error); drawModel(snapshot, selection); return }
      const next = { ...snapshot, revision: answer.result.revision, selection: answer.result.selection }
      drawModel(next, next.selection)
      model.say(answer.result.sessionError ? copy.modelSavedNotApplied : copy.modelSaved)
    }, { primary: true }), chosen === undefined || !dirty)
    const actions = el('div', CLASS.row)
    actions.append(save, button(copy.reload, loadModel))
    model.body.replaceChildren(row, ...(chosen === undefined ? [el('p', CLASS.hint, copy.modelUnknown)] : []), actions)
    lock()
  }

  /* ------------------------------------------------------------ plugins */

  const plugins = block(copy.pluginsTitle, copy.pluginsHint)
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
    if (answer.ok) plugins.say(copy.pluginDone)
    else if (answer.error.code === STALE) plugins.say(copy.stale, true)
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
        toggle.setAttribute(ARIA.label, copy.pluginToggle(bundle.name))
        toggle.addEventListener('change', () => { void changePlugin(toggle.checked ? 'pluginEnable' : 'pluginDisable', { inventoryRevision, name: bundle.name }) })
        item.append(labelled(copy.enabled, toggle),
          button(copy.remove, () => changePlugin('pluginRemove', { inventoryRevision, name: bundle.name }), { label: copy.removeLabel(bundle.name) }))
      } else item.append(el('span', CLASS.tag, copy.core))
      list.append(item)
    }
    const spec = el('input', CLASS.input)
    spec.type = 'text'
    spec.setAttribute(ARIA.label, copy.installSpec)
    const installButton = keep(button(copy.install, () => install(spec.value.trim()), { primary: true }), true)
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
          installedNames.has(entry.packageName) ? el('span', CLASS.tag, copy.installed)
            : button(copy.install, () => install(entry.spec), { label: copy.installLabel(entry.packageName) }))
        rows.append(item)
      }
      return [el('h4', CLASS.label, copy.category[category] ?? category), rows]
    })
    plugins.body.replaceChildren(
      el('h3', CLASS.subtitle, copy.installed),
      bundles.length === 0 ? el('p', CLASS.hint, copy.noPlugins) : list,
      el('h3', CLASS.subtitle, copy.installTitle), el('p', CLASS.hint, copy.installHint), installRow,
      el('h3', CLASS.subtitle, copy.recommendedTitle), el('p', CLASS.hint, copy.recommendedHint), ...recommendedNodes)
    lock()
  }

  /* ------------------------------------------------------------ plugin settings */

  const settings = block(copy.settingsTitle, copy.settingsHint)
  async function loadSettings() {
    const answer = await adminRequest('settingsGet')
    if (!answer.ok) { settings.refuse(answer.error); settings.body.replaceChildren(); return }
    const { writable, namespaces } = answer.result
    const notice = !writable ? copy.settingsReadOnly : namespaces.length === 0 ? copy.settingsNone : null
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
        description: typeof field.meta?.description === 'string' ? field.meta.description : undefined,
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
        hint: copy.listHint,
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
      return { control: el('pre', CLASS.readOnly, JSON.stringify(current ?? null, null, 2)), hint: copy.readOnlyField, read: () => ({ changed: false }) }
    }
    const input = el('input', CLASS.input)
    if (field.kind === FIELD_KIND.secret) {
      // The admin never sends a secret, only whether it is set; the field is write-only.
      input.type = 'password'
      const set = secrets.some((slot) => JSON.stringify(slot.path) === key && slot.set)
      return { control: input, hint: set ? copy.secretSet : copy.secretUnset, read: () => (input.value === '' ? { changed: false } : { changed: true, value: input.value }) }
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
    section.append(el('h3', CLASS.subtitle, entry.ns))
    const readers = formFields(entry.schema).map((field) => {
      const { control, hint, read } = fieldControl(field, valueAt(entry.value, field.path), entry.secrets)
      const caption = field.path.join('.') || entry.ns
      const node = labelled(caption, control)
      for (const text of [field.description, hint]) if (text) node.append(el('span', CLASS.hint, text))
      section.append(node)
      return { field, read }
    })
    const message = el('p', CLASS.status)
    message.hidden = true
    const say = (text, error) => { message.textContent = text; message.className = error ? CLASS.error : CLASS.status; message.hidden = false }
    const save = button(copy.save, async () => {
      const ops = []
      for (const { field, read } of readers) {
        const answer = read()
        if (!answer.changed) continue
        if (answer.invalid) { say(copy.settingsInvalid, true); return }
        ops.push({ op: SET_OP, path: field.path, value: answer.value })
      }
      if (ops.length === 0) return
      save.textContent = copy.saving
      keep(save, true)
      const answer = await adminRequest('settingsMutate', { ns: entry.ns, revision: entry.revision, ops })
      // A stale revision is never retried over the other writer: the forms are re-read and the
      // user is told, so they review the current values before saving again.
      if (answer.error?.code === STALE) { await loadSettings(); settings.say(copy.stale, true); return }
      if (!answer.ok) { save.textContent = copy.save; keep(save, false); say(copy.refused(answer.error.code), true); return }
      await loadSettings()
      settings.say(copy.settingsSaved)
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
