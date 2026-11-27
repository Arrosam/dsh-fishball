window.__ModuleLoader__.load({
  id: 'dsh-connector-amenities',
  factory(require) {
    const React = require('react')
    const {
      Button, Input, SettingsForm, SettingsFormModel, SettingsValueField, settingsNumberField, settingsTextField,
    } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement
    /**
     * The umbrella's identity and its members' settings pages (dsh-connector-adapter and dsh-connector-watchdog, each its own package). DSH's Plugins page
     * gives a component row a Configure control only when a client registers `plugins.row.config`
     * keyed `<bundle package>#<row id>` (dsh-client-ui-plugin-manager rowConfigKey); the members
     * have no browser code, so this umbrella registers one page per configurable member row, each
     * only while DSH serves that row's settings namespace (the row id). Installed alone, without this
     * umbrella, a member has no page (a known limit, README).
     */
    const UMBRELLA = Object.freeze({
      id: 'dsh-connector-amenities',
      locale: 'dsh-connector-amenities',
      /** The member rows with settings, by row id (cordis.patch.yml); preset-watchdog is DSH's agent preset, which serves no settings. */
      rows: Object.freeze(["dsh-connector-adapter","dsh-connector-watchdog"]),
      rowKeySeparator: '#',
      slot: Object.freeze({ bundle: 'plugins.bundle.config', row: 'plugins.row.config' }),
      summaryView: 'summary',
      effect: Object.freeze({ locale: 'dsh-connector-amenities: locale', hint: 'dsh-connector-amenities: hint', page: 'dsh-connector-amenities: settings page ' }),
    })
    /**
     * The page is built from the schema DSH serves for the namespace (dsh-settings: only the row's
     * `.volatile()` fields, serialized schemastery), so a field a member adds shows with no code
     * here beyond its label. Kinds: a `{provider, model, reasoningEffort?}` object is a model
     * selector over DSH's live model catalog (saved immediately on pick); a number or a string is
     * one staged text field of DSH's own settings form (Save writes them together); an array of
     * objects is a list editor with its own Save, writing the whole list at once, as the
     * connector's token list does.
     */
    const SCHEMA = Object.freeze({ number: 'number', string: 'string', array: 'array', object: 'object' })
    const MODEL = Object.freeze({
      unset: '',
      effortless: null,
      catalog: Object.freeze({ loading: 'loading', ready: 'ready', failed: 'failed' }),
      /** DSH's remote session face (`dsh-api-session-controller`, all supported SDKs), looked up via `ctx.get`. */
      remoteSession: 'remote.session',
      providerField: 'provider',
      modelField: 'model',
      effortField: 'reasoningEffort',
      routeSeparator: ' / ',
    })
    const OP_SET = 'set'
    /** ConfigFormSnapshot.status while the namespace is not served to this client. */
    const UNAVAILABLE = 'unavailable'
    /** A label's dictionary key: `field.<field>`, and `field.<list>.<item field>` inside a list. */
    const LABEL_PREFIX = 'field.'
    const PATH_SEPARATOR = '.'
    const SUMMARY_PREFIX = 'summary.'
    /** DSH's theme tokens and its settings-field type steps (12/18 captions), as dsh-agent-connector's page uses them. */
    const STYLE = Object.freeze({
      page: Object.freeze({ display: 'grid', gap: '24px' }),
      hintLine: Object.freeze({ margin: 0, fontSize: '13px', opacity: 0.78 }),
      list: Object.freeze({ display: 'grid', gap: '8px' }),
      select: Object.freeze({
        boxSizing: 'border-box',
        width: '100%',
        height: '34px',
        padding: '0 12px',
        border: '.5px solid var(--dsw-alias-border-l4)',
        borderRadius: 'var(--dsw-radius-md)',
        background: 'var(--dsw-alias-bg-layer-3)',
        font: 'var(--dsw-font-xs-13)',
        color: 'var(--dsw-alias-label-primary)',
      }),
      title: Object.freeze({ margin: 0, fontSize: '13px', fontWeight: 500 }),
      caption: Object.freeze({ margin: 0, fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' }),
      error: Object.freeze({ margin: 0, fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-state-error-primary)' }),
      item: Object.freeze({ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }),
      // A grid cell, so DSH's Input stretches to it (as dsh-agent-connector's page lays its inputs out).
      itemField: Object.freeze({ flex: '1 1 160px', minWidth: 0, display: 'grid' }),
      actions: Object.freeze({ display: 'flex', justifyContent: 'flex-end', gap: '8px' }),
    })
    const FORM_WORDS = Object.freeze(['unavailable', 'readOnly', 'saveFailed', 'save', 'saving'])
    /**
     * A list's rules its schema cannot state, checked before Save so the page does not save a list
     * the member's apply refuses (a refused apply fails the row, and a failed row has no page). The
     * adapter's servers (dsh-connector-adapter index.js serverSpecs, src/connector-check.js
     * isAllowedServerUrl, src/constants.js SERVER_URL): one entry per serverName, and a URL that is
     * https, or http on a loopback host. A browser file cannot import them: keep in step with those.
     */
    const LIST_RULES = Object.freeze({
      servers: Object.freeze({
        unique: 'serverName',
        url: Object.freeze({ field: 'url', secure: 'https:', loopback: 'http:', loopbackHosts: Object.freeze(['127.0.0.1', '[::1]', 'localhost']) }),
      }),
    })
    /** The message key of each list rule a draft breaks (LIST_RULES), beside the schema's `invalid`. */
    const RULE_WORD = Object.freeze({ unique: 'invalid.unique', url: 'invalid.url' })

    const en = {
      hint: 'This installs the DSH Connector amenities, dsh-connector-adapter and dsh-connector-watchdog (each also installable on its own). Open a component below to configure it.',
      'summary.dsh-connector-adapter': 'Signs this DSH in to other DSHs\' connectors.',
      'summary.dsh-connector-watchdog': 'Supervises managed sessions for their managers.',
      'field.clientMetadataUrl': 'Client metadata URL',
      'field.servers': 'Connectors to sign in to',
      'field.servers.serverName': 'Server name',
      'field.servers.url': 'MCP URL',
      'field.model': 'Watchdog model',
      'field.minCheckIntervalSeconds': 'Patrol interval (seconds)',
      'field.readMaxMessages': 'Messages read per judgement',
      'field.readMaxBytes': 'Bytes read per judgement',
      'field.checkTimeoutSeconds': 'Judgement time limit (seconds)',
      modelDisabled: 'Disabled (no model selected)',
      modelEffort: '{model} · {effort}',
      modelLoading: 'Loading available models…',
      modelNone: 'No model is configured in this DSH yet.',
      modelFailed: 'Available models could not be read.',
      modelSaveFailed: 'The model was not saved.',
      unavailable: 'This component is not loaded, so it cannot be configured right now.',
      readOnly: 'This deployment stores settings read-only.',
      save: 'Save',
      saving: 'Saving…',
      saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
      overridden: 'Set',
      reset: 'Reset',
      invalid: 'Not a valid value.',
      'invalid.unique': 'Each entry needs its own name.',
      'invalid.url': 'Use an https URL, or http only on this computer (localhost, 127.0.0.1 or [::1]).',
      add: 'Add',
      remove: 'Remove',
      discard: 'Discard',
    }
    const zh = {
      hint: '此插件一并安装 DSH Connector 的附加组件 dsh-connector-adapter 与 dsh-connector-watchdog（二者也可单独安装）。点开下方的组件即可配置它。',
      'summary.dsh-connector-adapter': '让此 DSH 登录其他 DSH 的 connector。',
      'summary.dsh-connector-watchdog': '为管理者监督其管理的会话。',
      'field.clientMetadataUrl': '客户端元数据地址',
      'field.servers': '要登录的 connector',
      'field.servers.serverName': '服务器名称',
      'field.servers.url': 'MCP 地址',
      'field.model': 'Watchdog 模型',
      'field.minCheckIntervalSeconds': '巡查间隔（秒）',
      'field.readMaxMessages': '每次判断读取的消息数',
      'field.readMaxBytes': '每次判断读取的字节数',
      'field.checkTimeoutSeconds': '判断时限（秒）',
      modelDisabled: '未配置（停用 Watchdog）',
      modelEffort: '{model} · {effort}',
      modelLoading: '正在读取可用模型…',
      modelNone: '此 DSH 还没有配置模型。',
      modelFailed: '无法读取可用模型。',
      modelSaveFailed: '模型没有保存。',
      unavailable: '该组件当前未加载，暂时无法配置。',
      readOnly: '本部署的设置为只读。',
      save: '保存',
      saving: '保存中…',
      saveFailed: '本部署没有接受这些值，已保留供你修改。',
      overridden: '已设置',
      reset: '重置',
      invalid: '不是有效的值。',
      'invalid.unique': '每个条目需要各自的名称。',
      'invalid.url': '请使用 https 地址；http 仅限本机（localhost、127.0.0.1 或 [::1]）。',
      add: '添加',
      remove: '移除',
      discard: '放弃',
    }

    /** A field's label: its dictionary entry, else its own name (a field added since has no entry yet). */
    const labelOf = (t, path) => {
      const key = LABEL_PREFIX + path.join(PATH_SEPARATOR)
      return Object.hasOwn(en, key) ? t(key) : path[path.length - 1]
    }
    const hintOf = (node) => (typeof node.meta?.description === 'string' ? node.meta.description : undefined)
    const isList = (node) => node.type === SCHEMA.array && node.inner?.type === SCHEMA.object
    const isModelField = (node) => node.type === SCHEMA.object
      && node.dict?.[MODEL.providerField]?.type === SCHEMA.string
      && node.dict?.[MODEL.modelField]?.type === SCHEMA.string
    const storeHook = (source) => [(listener) => source.subscribe(listener), () => source.getSnapshot()]
    const storedModel = (value) => {
      if (value === null || typeof value !== 'object') return undefined
      const provider = typeof value[MODEL.providerField] === 'string' ? value[MODEL.providerField].trim() : ''
      const model = typeof value[MODEL.modelField] === 'string' ? value[MODEL.modelField].trim() : ''
      if (provider === '' || model === '') return undefined
      const effort = typeof value[MODEL.effortField] === 'string' ? value[MODEL.effortField].trim() : ''
      return effort === '' ? { [MODEL.providerField]: provider, [MODEL.modelField]: model }
        : { [MODEL.providerField]: provider, [MODEL.modelField]: model, [MODEL.effortField]: effort }
    }
    const modelChoiceValue = (selection) => (selection === undefined ? MODEL.unset
      : JSON.stringify([selection[MODEL.providerField], selection[MODEL.modelField], selection[MODEL.effortField] ?? MODEL.effortless]))
    const fallbackModelLabel = (selection, t) => {
      const base = selection[MODEL.providerField] + MODEL.routeSeparator + selection[MODEL.modelField]
      return selection[MODEL.effortField] === undefined ? base : t('modelEffort', { model: base, effort: selection[MODEL.effortField] })
    }
    function modelChoices(catalog, t) {
      return (catalog?.groups ?? []).flatMap((group) => (group.models ?? []).flatMap((entry) => {
        const base = { [MODEL.providerField]: group.id, [MODEL.modelField]: entry.id }
        const label = group.name + MODEL.routeSeparator + entry.name
        const efforts = entry.reasoning?.efforts ?? []
        const of = (selection, text) => ({ value: modelChoiceValue(selection), label: text, selection })
        return efforts.length === 0 ? [of(base, label)] : efforts.map((effort) => of({ ...base, [MODEL.effortField]: effort.id }, t('modelEffort', { model: label, effort: effort.name })))
      }))
    }
    const parseUrl = (text) => { try { return new URL(text) } catch { return undefined } }
    const allowedUrl = (rule, text) => {
      const url = parseUrl(text)
      return url !== undefined && (url.protocol === rule.secure || (url.protocol === rule.loopback && rule.loopbackHosts.includes(url.hostname)))
    }
    /**
     * The items a list's own rules refuse (LIST_RULES): `{index: {field: word}}`, empty when it passes.
     * An empty name is the schema's to refuse (its pattern), so uniqueness compares filled names only.
     * The URL is checked even when empty: the schema's `required` accepts '', which the member's
     * apply refuses (isAllowedServerUrl('') is false).
     */
    function ruleProblems(field, items) {
      const rule = LIST_RULES[field]
      const problems = {}
      const mark = (index, name, word) => { (problems[index] ??= {})[name] = word }
      if (rule === undefined) return problems
      items.forEach((item, index) => {
        const value = item?.[rule.unique]
        if (value && items.findIndex((other) => other?.[rule.unique] === value) !== index) mark(index, rule.unique, RULE_WORD.unique)
        const url = item?.[rule.url.field]
        if (!allowedUrl(rule.url, url ?? '')) mark(index, rule.url.field, RULE_WORD.url)
      })
      return problems
    }

    /**
     * One namespace's page parts, built from one served schema: the staged form over its number and
     * string fields, and its lists. Each group keeps schema order; the lists come after the form,
     * because DSH's SettingsForm draws its Save after its children, so a list (with its own Save)
     * placed among them would put two Saves in one block, the form's far below its fields.
     */
    function buildForm(ctx, rowId, schema) {
      const scope = ctx.configForms.get(rowId)
      const fields = Object.entries(schema.dict ?? {})
      // A text field whose draft the field's own schema refuses (bounds, whole number, pattern)
      // is invalid, so DSH's form blocks Save instead of sending what the Host would refuse.
      const checked = (spec, node) => ({ ...spec, parse: (text) => {
        const write = spec.parse(text)
        return write?.kind === OP_SET && ctx.settingsSchema.validate(node, write.value) !== undefined ? undefined : write
      } })
      const values = fields.filter(([, node]) => node.type === SCHEMA.number || node.type === SCHEMA.string)
      const specs = values.map(([field, node]) => checked((node.type === SCHEMA.number ? settingsNumberField : settingsTextField)(field), node))
      const model = new SettingsFormModel(scope, specs)
      const store = model.bind(() => ({ ...model.shell(), fields: Object.fromEntries(values.map(([field]) => [field, model.field(field)])) }))
      return {
        scope, model, store, actions: model.actions(),
        models: fields.filter(([, node]) => isModelField(node)),
        values,
        lists: fields.filter(([, node]) => isList(node)),
      }
    }

    /**
     * A dedicated model selector (Watchdog's `model` field): a native select over DSH's live model
     * catalog (`remote.session.modelCatalog`), defaulting to unset (disabled). Selecting a model
     * writes `{provider, model, reasoningEffort?}` immediately; choosing the empty option unsets it.
     */
    function ModelField({ ctx, t, scope, field, node, disabled }) {
      const snapshot = React.useSyncExternalStore(...storeHook(scope))
      const [catalog, setCatalog] = React.useState({ status: MODEL.catalog.loading })
      const [busy, setBusy] = React.useState(false)
      const [failed, setFailed] = React.useState(false)
      const mounted = React.useRef(true)
      const id = React.useId()
      React.useEffect(() => {
        mounted.current = true
        let live = true
        // Looked up by name instead of injected: if remote.session is unavailable, the settings
        // page still opens with the catalog-failed note instead of hiding the row's other settings.
        Promise.resolve().then(() => ctx.get(MODEL.remoteSession).modelCatalog()).then((answer) => {
          if (live) setCatalog(answer?.ok === true ? { status: MODEL.catalog.ready, value: answer.value } : { status: MODEL.catalog.failed })
        }, () => { if (live) setCatalog({ status: MODEL.catalog.failed }) })
        return () => { live = false; mounted.current = false }
      }, [])
      const choices = catalog.status === MODEL.catalog.ready ? modelChoices(catalog.value, t) : []
      const saved = storedModel(snapshot.value?.[field])
      const current = modelChoiceValue(saved)
      const pick = async (value) => {
        if (busy) return
        const choice = choices.find((entry) => entry.value === value)
        if (value !== MODEL.unset && choice === undefined) return
        setBusy(true)
        setFailed(false)
        let accepted = false
        try { accepted = await (choice === undefined ? scope.unset(field) : scope.set(field, choice.selection)) } catch { accepted = false }
        if (!mounted.current) return
        setBusy(false)
        setFailed(!accepted)
      }
      const off = disabled || busy
      const hint = hintOf(node)
      const note = catalog.status === MODEL.catalog.loading ? t('modelLoading')
        : catalog.status === MODEL.catalog.failed ? t('modelFailed')
        : choices.length === 0 ? t('modelNone')
        : null
      return h('section', { style: STYLE.list, 'data-amenities-model': field },
        h('label', { style: STYLE.title, htmlFor: id }, labelOf(t, [field])),
        h('select', {
          id, style: STYLE.select, value: current, disabled: off, 'data-amenities-model-select': field,
          onChange: (event) => void pick(event.target.value),
        },
          h('option', { value: MODEL.unset }, t('modelDisabled')),
          // A saved model missing from the current catalog stays shown so the select never pretends it is unset.
          saved !== undefined && !choices.some((entry) => entry.value === current)
            ? h('option', { value: current }, fallbackModelLabel(saved, t))
            : null,
          choices.map((entry) => h('option', { key: entry.value, value: entry.value }, entry.label))),
        hint === undefined ? null : h('p', { style: STYLE.caption }, hint),
        note === null ? null : h('p', { style: STYLE.caption, role: 'status' }, note),
        failed ? h('p', { style: STYLE.error, role: 'alert' }, t('modelSaveFailed')) : null)
    }

    /**
     * A list of objects (the adapter's servers): each item's string fields, Add, Remove, and one
     * Save writing the whole list, fenced by the revision read when editing began, so a list
     * changed elsewhere meanwhile refuses the save instead of being overwritten. Save waits until
     * the list is valid under its schema and its own rules (LIST_RULES); a refused save keeps the draft.
     */
    function ListField({ ctx, t, scope, field, node, disabled }) {
      const snapshot = React.useSyncExternalStore(...storeHook(scope))
      const [draft, setDraft] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [failed, setFailed] = React.useState(false)
      const baseId = React.useId()
      const saved = Array.isArray(snapshot.value?.[field]) ? snapshot.value[field] : []
      const items = draft?.items ?? saved
      const itemFields = Object.entries(node.inner.dict ?? {})
      const stage = (change) => {
        setFailed(false)
        setDraft((current) => ({ items: change([...(current?.items ?? saved)]), revision: current?.revision ?? snapshot.revision }))
      }
      const problems = ruleProblems(field, items)
      const broken = [...new Set(Object.values(problems).flatMap((item) => Object.values(item)))]
      const invalid = draft !== null && (ctx.settingsSchema.validate(node, draft.items) !== undefined || broken.length > 0)
      const save = async () => {
        setBusy(true)
        let accepted = false
        try { accepted = await scope.mutate([{ op: OP_SET, path: [field], value: draft.items }], draft.revision) } catch { accepted = false }
        setBusy(false)
        if (accepted) setDraft(null)
        setFailed(!accepted)
      }
      const off = disabled || busy
      const hint = hintOf(node)
      return h('section', { style: STYLE.list, 'data-amenities-list': field },
        h('h4', { style: STYLE.title }, labelOf(t, [field])),
        hint === undefined ? null : h('p', { style: STYLE.caption }, hint),
        ...items.map((item, index) => h('div', { key: index, style: STYLE.item, 'data-amenities-list-item': index },
          ...itemFields.map(([name, inner]) => h('span', { key: name, style: STYLE.itemField },
            h(Input, {
              id: baseId + index + name, 'aria-label': labelOf(t, [field, name]), placeholder: labelOf(t, [field, name]), title: hintOf(inner),
              value: typeof item?.[name] === 'string' ? item[name] : '', disabled: off, 'aria-invalid': problems[index]?.[name] !== undefined,
              onChange: (event) => stage((next) => { next[index] = { ...next[index], [name]: event.target.value }; return next }),
            }))),
          h(Button, { type: 'button', size: 'sm', variant: 'outline', disabled: off, onClick: () => stage((next) => { next.splice(index, 1); return next }) }, t('remove')))),
        h('div', { style: STYLE.actions },
          h(Button, { type: 'button', size: 'sm', variant: 'outline', disabled: off, onClick: () => stage((next) => [...next, Object.fromEntries(itemFields.map(([name]) => [name, '']))]) }, t('add')),
          draft === null ? null : h(Button, { type: 'button', size: 'sm', variant: 'ghost', disabled: busy, onClick: () => { setDraft(null); setFailed(false) } }, t('discard')),
          draft === null ? null : h(Button, { type: 'button', size: 'sm', variant: 'primary', disabled: off || invalid, onClick: () => void save() }, busy ? t('saving') : t('save'))),
        invalid ? h('p', { style: STYLE.error, role: 'alert' }, broken.length > 0 ? broken.map((word) => t(word)).join(' ') : t('invalid')) : null,
        failed ? h('p', { style: STYLE.error, role: 'alert' }, t('saveFailed')) : null)
    }

    /**
     * One member row's page. Its form is rebuilt only when the served schema changes (a member
     * added a field), and disposed with the page's registration.
     * @returns `{Page, dispose}`
     */
    function rowPage(ctx, t, rowId) {
      let current
      const describe = ctx.configForms.describe()
      const formFor = (json) => {
        const key = JSON.stringify(json)
        if (current?.key !== key) {
          current?.model.dispose()
          current = { key, ...buildForm(ctx, rowId, ctx.settingsSchema.rehydrate(json)) }
        }
        return current
      }
      function Page(props) {
        React.useSyncExternalStore((listener) => ctx.locale.subscribe(listener), () => ctx.locale.getSnapshot())
        const mirrored = React.useSyncExternalStore(...storeHook(describe))
        const baseId = React.useId()
        if (props.view === UMBRELLA.summaryView) return t(SUMMARY_PREFIX + rowId)
        const served = mirrored.view?.namespaces.find((view) => view.ns === rowId)
        if (served === undefined) return h('p', { style: STYLE.caption, role: 'status' }, t('unavailable'))
        const form = formFor(served.schema)
        return h(RowForm, { ctx, t, form, baseId })
      }
      return { Page, dispose: () => current?.model.dispose() }
    }

    function RowForm({ ctx, t, form, baseId }) {
      const state = React.useSyncExternalStore(...storeHook(form.store))
      const disabled = !state.writable || state.saving
      const labels = Object.fromEntries(FORM_WORDS.map((word) => [word, t(word)]))
      const available = state.available && form.scope.getSnapshot().status !== UNAVAILABLE
      return h('div', { style: STYLE.page, 'data-amenities-settings': true },
        // Model fields sit above the form so Watchdog's enable/model choice is the first control;
        // DSH's form shows the unavailable line itself when the namespace is unavailable.
        available
          ? form.models.map(([field, node]) => h(ModelField, { key: field, ctx, t, scope: form.scope, field, node, disabled: !state.writable }))
          : null,
        h(SettingsForm, { labels, state, onSave: form.actions.save, onDiscard: form.actions.discard },
          ...form.values.map(([field, node]) => h('div', { key: field, 'data-amenities-setting': field },
            h(SettingsValueField, {
              id: baseId + field, label: labelOf(t, [field]), hint: hintOf(node), numeric: node.type === SCHEMA.number,
              ...state.fields[field], overriddenLabel: t('overridden'), resetLabel: t('reset'), invalidLabel: t('invalid'), disabled,
              onEdit: (text) => form.actions.edit(field, text), onReset: () => form.actions.resetField(field),
            })))),
        available
          ? form.lists.map(([field, node]) => h(ListField, { key: field, ctx, t, scope: form.scope, field, node, disabled: !state.writable }))
          : null)
    }

    function apply(ctx) {
      const t = ctx.locale.bind(UMBRELLA.locale)
      ctx.effect(() => ctx.locale.register(UMBRELLA.locale, { en, zh }), UMBRELLA.effect.locale)
      ctx.effect(() => ctx.slots.inject(UMBRELLA.slot.bundle, () => ctx.slots.register({
        name: UMBRELLA.slot.bundle,
        key: UMBRELLA.id,
        locale: UMBRELLA.locale,
      }, () => h('p', { style: STYLE.hintLine }, t('hint')))), UMBRELLA.effect.hint)
      // Registered only while DSH serves the row's namespace (configForms.whileServed), as DSH's own
      // settings pages and dsh-agent-connector's page are: a row that is not running has no page.
      for (const rowId of UMBRELLA.rows) {
        ctx.effect(() => ctx.configForms.whileServed([rowId], () => {
          const page = rowPage(ctx, t, rowId)
          const off = ctx.slots.inject(UMBRELLA.slot.row, () => ctx.slots.register({
            name: UMBRELLA.slot.row,
            key: UMBRELLA.id + UMBRELLA.rowKeySeparator + rowId,
            locale: UMBRELLA.locale,
          }, page.Page))
          return () => { off(); page.dispose() }
        }), UMBRELLA.effect.page + rowId)
      }
    }

    return { name: UMBRELLA.id, inject: ['slots', 'locale', 'configForms', 'settingsSchema'], apply }
  },
})
