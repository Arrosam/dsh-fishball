/**
 * The instance's own plugin settings page (I-HOST; requirements 1.33 Q-D1 = B: "Reconnect is on the
 * instance plugin's own settings page"; R-ARCH-05: "its only browser code is its own plugin
 * settings page (status, Retry, Reconnect, model sync, Open in window)"; 1.41 Q-G3, Q-G7). It moved
 * here from dsh-connector-ui's `client.instance.js`: dsh-connector-ui draws no instance card any
 * more. A chunk of the instance's `client.js`, which loads it with the status line chunk.
 *
 * The main DSH holds only `enabled`, needed before the child exists. The actual parent is fixed;
 * additional targets are configured inside Fishball, never through this instance page. No token
 * and no credential reference is editable here. Above the switch:
 * - the status line (client.status.js) with Retry, and Retry's notice after a deleted hosted entry;
 * - Reconnect: a new hosted token imported into the child once (R11; always shown, Q-B2);
 * - Open Fishball: the child's Fishball page in a new tab, through one admission (Q7 = A);
 * - "Model for Fishball" (D26, §10): Check, then Add selected. It copies providers and their model
 *   lists only; the model Fishball uses is chosen in Fishball's own settings (the user,
 *   2026-11-16: "同步只是同步model list，至于fishball用什么还要在fishball内设置").
 * The fields are the row's volatile config: DSH's settings form can write volatile fields only.
 */
window.__ModuleLoader__.load({
  id: 'dsh-instance',
  chunk: 'client.models.js',
  factory(require) {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
    const { Button, Checkbox, IconRightUpOutlineRegular, SettingsForm, SettingsFormModel, Switch, Tag } = require('@deepseek-ai/dsh-client-ui-primitives')

    const h = React.createElement

    /**
     * The row's identity. The row id is the settings namespace DSH serves and also the package
     * name, so the slot key the Plugins page dispatches is `<package>#<row id>` (§0.2, D22). The
     * card's locale namespace is the status line's (`shared.locale`), so its words and the line's
     * are one dictionary.
     */
    const PLUGIN = Object.freeze({
      id: 'dsh-instance',
      slot: 'plugins.bundle.config',
    })
    /** The form's two views; `summary` is the row's one-liner, `page` the form and its Save. */
    const VIEW = Object.freeze({ summary: 'summary', page: 'page' })
    /** The only launch field: the parent URL is supplied by the host, not editable here. */
    const FIELD = Object.freeze({ enabled: 'enabled' })
    const LAUNCH_FIELDS = Object.freeze([FIELD.enabled])
    /**
     * The page's own actions (src/host/routes.js INSTANCE_ROUTE, page-relative): Reconnect answers
     * `{ok}` or `{ok: false, code}`; Open answers `{ok: true, url}`, opened in a new tab with no
     * opener and no referrer, and never kept.
     */
    const ACTION = Object.freeze({
      reconnectPath: 'api/dsh-instance/reconnect',
      openPath: 'api/dsh-instance/open',
      request: Object.freeze({ method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: Object.freeze({ 'content-type': 'application/json' }) }),
      unreadable: 'request-failed',
      langs: Object.freeze(['zh', 'en']),
      fallbackLang: 'en',
      target: '_blank',
      features: 'noopener,noreferrer',
      ready: 'ready',
    })
    /**
     * The staged spelling of the boolean field. `SettingsFormModel` stages every field as text and
     * parses it on save; DSH ships field factories for text and numbers only, so `enabled` names
     * its own two spellings and nothing else parses.
     */
    const FLAG = Object.freeze({ on: 'true', off: 'false' })
    /**
     * The "Model for Fishball" block (§10, D26; src/host/provider-sync-routes.js). Check posts
     * no body and answers `{checkId, missing, notOffered, present}`; Add posts `{checkId, ids}` and
     * answers `{items: [{id, outcome, reason?}]}`. Every answer is `{ok, result|error}`; the browser
     * never gets a key, a mask, an endpoint or a variable name.
     * - `restarted`: the codes that mean the check no longer matches the running child (a restart,
     *   a stop, an expired or changed check); the list is cleared and the user checks again.
     * - `reasons` / `errors`: the codes with their own words; any other shows its code.
     */
    const MODEL_SYNC_UI = Object.freeze({
      check: 'api/dsh-instance/models/check',
      add: 'api/dsh-instance/models/add',
      phase: Object.freeze({ idle: 'idle', checking: 'checking', listed: 'listed', adding: 'adding', result: 'result' }),
      outcome: Object.freeze({ added: 'added', skipped: 'skipped', failed: 'failed' }),
      outcomeTone: Object.freeze({ added: 'info', skipped: 'neutral', failed: 'danger' }),
      busy: 'sync-busy',
      unknownReason: 'result-unknown',
      restarted: Object.freeze(['repreview-required', 'preview-expired', 'sync-closed', 'peer-mismatch', 'child-sync-disconnected', 'child-sync-unavailable', 'target-unavailable']),
      reasons: Object.freeze(['oauth-login', 'unsupported-provider', 'non-https-endpoint', 'provider-conflict', 'incompatible-owner-or-schema', 'no-api-key',
        'api-key-env-unset', 'version-mismatch', 'credential-not-writable', 'missing-revision', 'repreview-required', 'result-unknown',
        'key-not-saved', 'unsupported-record', 'provider-exists']),
      unreadable: 'provider-sync-refused',
      separator: ' · ',
    })
    /**
     * The card's own classes. The status line's classes, `hint` and `statusRow` included, and the
     * layout tokens come from the status-line module (`layout.classes`, `layout.style`), which
     * defines those rules once for both pages; the model block reuses them.
     */
    const OWN_CLS = Object.freeze({ page: 'fb-instance-page', section: 'fb-instance-section', sectionTitle: 'fb-instance-section-title', actions: 'fb-instance-actions', feature: 'fb-instance-feature', toggleRow: 'fb-instance-toggle-row', toggleText: 'fb-instance-toggle-text', sync: 'fb-instance-sync', syncTitle: 'fb-instance-sync-title', syncList: 'fb-instance-sync-list', syncRow: 'fb-instance-sync-row', syncModels: 'fb-instance-sync-models', error: 'fb-instance-error' })
    /** DSH's small-button glyph size. */
    const ICON_PX = 14
    /**
     * The card's own rules, over the status line's layout tokens: DSH's Plugins page rhythm (a titled
     * section per part, its rows in a layer-1 card) and its settings rows (words left, control right).
     */
    const cardCss = (STYLE) => [
      // One grid for the page's sections: DSH's Plugins page spaces only its own slot entries, so the
      // page's parts sit in one wrapper and take DSH's section gap from it.
      `.${OWN_CLS.page}{display:grid;gap:${STYLE.sectionGap};min-width:0}`,
      `.${OWN_CLS.section}{display:grid;gap:${STYLE.blockGap};color:var(--dsw-alias-label-primary);font:var(--dsw-font-xs-13);line-height:${STYLE.lineHeight}}`,
      `.${OWN_CLS.sectionTitle},.${OWN_CLS.syncTitle}{margin:0;font:var(--dsw-font-s-strong-14)}`,
      `.${OWN_CLS.actions}{display:flex;flex-wrap:wrap;align-items:center;gap:${STYLE.stackGap}}`,
      // A card row's content (the card's own rules give each row its padding and the rule between rows).
      `.${OWN_CLS.feature}{display:grid;gap:${STYLE.stackGap}}`,
      `.${OWN_CLS.toggleRow}{display:flex;align-items:center;justify-content:space-between;gap:${STYLE.gap};color:var(--dsw-alias-label-primary);font:var(--dsw-font-xs-13);line-height:${STYLE.lineHeight}}`,
      `.${OWN_CLS.toggleText}{font-weight:500}`,
      `.${OWN_CLS.sync}{display:grid;gap:${STYLE.blockGap};color:var(--dsw-alias-label-primary);font:var(--dsw-font-xs-13);line-height:${STYLE.lineHeight}}`,
      `.${OWN_CLS.syncList}{list-style:none;margin:0;padding:0;display:grid;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);overflow:hidden}`,
      `.${OWN_CLS.syncRow}{display:flex;align-items:center;flex-wrap:wrap;gap:${STYLE.stackGap};padding:10px 12px}`,
      `.${OWN_CLS.syncRow}+.${OWN_CLS.syncRow}{border-top:.5px solid var(--dsw-alias-border-l2)}`,
      `.${OWN_CLS.syncModels}{flex-basis:100%;margin:0;color:var(--dsw-alias-label-tertiary);font-size:${STYLE.hintSize};overflow-wrap:anywhere}`,
      `.${OWN_CLS.error}{margin:0;color:var(--dsw-alias-state-error-primary);font-size:${STYLE.hintSize};line-height:${STYLE.lineHeight}}`,
    ].join('')

    // Locale dictionaries are flat key→text maps (the service looks a key up verbatim), so the
    // per-field labels are spelled `field.<name>`.
    const en = {
      summary: 'Fishball\'s private instance: how DSH starts it.',
      'field.enabled': 'Enabled',
      launch: 'Launch',
      actions: 'Fishball',
      reconnect: 'Reconnect',
      reconnecting: 'Reconnecting…',
      reconnected: 'A new hosted token was imported into Fishball. The old hosted entry stays in the connector until you delete it.',
      reconnectHint: 'Creates a new hosted token in this DSH\'s connector and gives it to Fishball once.',
      'reconnectRefused.not-ready': 'Fishball is not running.',
      'reconnectRefused.connector-missing': 'There is no connector in this DSH.',
      'reconnectRefused.operation-failed': 'The connector could not create a token.',
      'reconnectRefused.credentials-unwritable': 'Fishball could not store the token. Delete the new hosted entry in the connector\'s settings.',
      open: 'Open Fishball',
      'openRefused.hostname-refused': 'Open DSH at 127.0.0.1 or localhost to open Fishball.',
      'openRefused.not-ready': 'Fishball is not running.',
      refused: 'Refused: {code}',
      enabledHint: 'Start Fishball\'s private instance after DSH is ready. Saving it off stops the instance at once and saving it on starts it; its private data is kept.',
      unavailable: 'This plugin is not loaded, so it cannot be configured right now.',
      readOnly: 'This deployment stores settings read-only.',
      save: 'Save',
      saving: 'Saving…',
      saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
      'sync.title': 'Model for Fishball',
      'sync.check': 'Check for new models',
      'sync.checking': 'Checking…',
      'sync.notRunning': 'Fishball is not running.',
      'sync.nothing': 'Nothing new to add.',
      'sync.present': '{count} already in Fishball',
      'sync.notOffered': 'Not offered ({count})',
      'sync.models': 'Models: {models}',
      'sync.noModels': 'No model list; Fishball uses the provider\'s own.',
      'sync.add': 'Add selected',
      'sync.adding': 'Adding…',
      'sync.cancel': 'Cancel',
      'sync.checkAgain': 'Check again',
      'sync.restarted': 'Fishball restarted. Check again.',
      'sync.busy': 'Another Add is still running. Wait for it, then try again.',
      'sync.unknown': 'The connection was lost during Add; some entries may already be in. Check again.',
      'sync.summary.added': 'Added {count}',
      'sync.summary.skipped': '{count} skipped',
      'sync.summary.failed': '{count} failed',
      'sync.outcome.added': 'added',
      'sync.outcome.skipped': 'skipped',
      'sync.outcome.failed': 'failed',
      'sync.refused': 'Refused: {code}',
      'sync.help': 'Copies API-key providers (including keys from environment variables) from DSH into Fishball; logins are not copied and none of Fishball\'s existing data is changed. Fishball\'s model catalog then checks what was added, which may read keys set for its other providers.',
      'syncReason.oauth-login': 'Uses a login, not an API key: log in inside Fishball.',
      'syncReason.unsupported-provider': 'Not a plain API-key provider (for example custom headers). Set it up inside Fishball.',
      'syncReason.non-https-endpoint': 'Its endpoint must use https; only https endpoints can be synced.',
      'syncReason.provider-conflict': 'Fishball has a different provider with this name; it is kept.',
      'syncReason.incompatible-owner-or-schema': 'Fishball\'s model plugin for this provider is different.',
      'syncReason.no-api-key': 'Has no API key in DSH.',
      'syncReason.api-key-env-unset': 'Its key comes from an environment variable that is not set for DSH.',
      'syncReason.version-mismatch': 'Fishball runs a different DSH version. Restart Fishball, then check again.',
      'syncReason.credential-not-writable': 'Fishball cannot store a key for this provider.',
      'syncReason.missing-revision': 'Fishball\'s model settings could not be read.',
      'syncReason.repreview-required': 'Changed during Add; check again.',
      'syncReason.result-unknown': 'The result is unknown. Check again to see it.',
      'syncReason.key-not-saved': 'The provider was added but its key was not saved. Check again.',
      'syncReason.unsupported-record': 'Its key in DSH is not a plain API key.',
      'syncReason.provider-exists': 'Fishball got this provider meanwhile; it is kept.',
    }
    const zh = {
      summary: 'Fishball 的私有实例：DSH 如何启动它。',
      'field.enabled': '启用',
      launch: '启动',
      actions: 'Fishball',
      reconnect: '重新连接',
      reconnecting: '正在重新连接…',
      reconnected: '已向 Fishball 导入一个新的托管 token。旧的托管条目会保留在连接器中，直到你删除它。',
      reconnectHint: '在本 DSH 的连接器中创建一个新的托管 token，并交给 Fishball 一次。',
      'reconnectRefused.not-ready': 'Fishball 未在运行。',
      'reconnectRefused.connector-missing': '本 DSH 中没有连接器。',
      'reconnectRefused.operation-failed': '连接器无法创建 token。',
      'reconnectRefused.credentials-unwritable': 'Fishball 无法保存该 token。请在连接器设置中删除新的托管条目。',
      open: '打开 Fishball',
      'openRefused.hostname-refused': '请用 127.0.0.1 或 localhost 打开 DSH，再打开 Fishball。',
      'openRefused.not-ready': 'Fishball 未在运行。',
      refused: '已拒绝：{code}',
      enabledHint: 'DSH 就绪后启动 Fishball 的私有实例。保存为关闭会立即停止它，保存为开启会启动它；私有数据保留。',
      unavailable: '该插件当前未加载，暂时无法配置。',
      readOnly: '本部署的设置为只读。',
      save: '保存',
      saving: '保存中…',
      saveFailed: '本部署没有接受这些值，已保留供你修改。',
      'sync.title': 'Fishball 的模型',
      'sync.check': '检查新模型',
      'sync.checking': '正在检查…',
      'sync.notRunning': 'Fishball 未在运行。',
      'sync.nothing': '没有可添加的新内容。',
      'sync.present': 'Fishball 中已有 {count} 个',
      'sync.notOffered': '不提供（{count}）',
      'sync.models': '模型：{models}',
      'sync.noModels': '没有模型列表；Fishball 使用该提供商自己的列表。',
      'sync.add': '添加所选',
      'sync.adding': '正在添加…',
      'sync.cancel': '取消',
      'sync.checkAgain': '重新检查',
      'sync.restarted': 'Fishball 已重启。请重新检查。',
      'sync.busy': '另一次添加仍在进行。请等它结束后再试。',
      'sync.unknown': '添加期间连接中断；部分条目可能已经加入。请重新检查。',
      'sync.summary.added': '已添加 {count} 个',
      'sync.summary.skipped': '跳过 {count} 个',
      'sync.summary.failed': '失败 {count} 个',
      'sync.outcome.added': '已添加',
      'sync.outcome.skipped': '已跳过',
      'sync.outcome.failed': '失败',
      'sync.refused': '已拒绝：{code}',
      'sync.help': '把 DSH 中的 API key 提供商（包括来自环境变量的 key）复制到 Fishball；登录不会复制，Fishball 已有的内容不会改变。之后 Fishball 的模型目录会检查新增的内容，这可能会读取它其他提供商的 key。',
      'syncReason.oauth-login': '使用登录而不是 API key：请在 Fishball 内登录。',
      'syncReason.unsupported-provider': '不是普通的 API key 提供商（例如自定义 header）。请在 Fishball 内设置。',
      'syncReason.non-https-endpoint': '它的 endpoint 必须使用 https；只有 https endpoint 可以同步。',
      'syncReason.provider-conflict': 'Fishball 中有同名但不同的提供商，保留原样。',
      'syncReason.incompatible-owner-or-schema': 'Fishball 中这个提供商的模型插件不同。',
      'syncReason.no-api-key': '它在 DSH 中没有 API key。',
      'syncReason.api-key-env-unset': '它的 key 来自环境变量，但 DSH 中未设置该变量。',
      'syncReason.version-mismatch': 'Fishball 运行的 DSH 版本不同。请重启 Fishball 后重新检查。',
      'syncReason.credential-not-writable': 'Fishball 无法为这个提供商保存 key。',
      'syncReason.missing-revision': '无法读取 Fishball 的模型设置。',
      'syncReason.repreview-required': '添加期间发生了变化，请重新检查。',
      'syncReason.result-unknown': '结果未知。请重新检查以确认。',
      'syncReason.key-not-saved': '提供商已新增，但它的 key 没有保存。请重新检查。',
      'syncReason.unsupported-record': '它在 DSH 中的 key 不是普通的 API key。',
      'syncReason.provider-exists': 'Fishball 在此期间已有这个提供商，保留原样。',
    }

    /**
     * `enabled` as a staged text field. The effective value of an unset field is the schema
     * default, true, so an unset field formats as "true" rather than as an empty switch.
     */
    const enabledField = Object.freeze({
      field: FIELD.enabled,
      format: (value) => String(value !== false),
      parse: (text) => {
        const spelled = text.trim()
        if (spelled === FLAG.on) return { kind: 'set', value: true }
        if (spelled === FLAG.off) return { kind: 'set', value: false }
        return undefined
      },
    })

    /** The form frame's copy, read from this card's dictionary. */
    function formLabels(t) {
      return {
        unavailable: t('unavailable'),
        readOnly: t('readOnly'),
        saveFailed: t('saveFailed'),
        save: t('save'),
        saving: t('saving'),
      }
    }

    /**
     * The staged form over the row's live config: one Save writes `enabled`.
     * @param scope - the row's configuration form (`configForms.get`).
     * @returns the page's snapshot, its form actions and its disposer.
     */
    function launchSection(scope) {
      const form = new SettingsFormModel(scope, [
        enabledField,
      ])
      const store = form.bind(() => ({
        ...form.shell(),
        fields: Object.fromEntries(LAUNCH_FIELDS.map((field) => [field, form.field(field)])),
      }))
      return { store, actions: form.actions(), dispose: () => form.dispose() }
    }

    /** One page action. @returns its answer, or `{ok: false, code: ACTION.unreadable}`. */
    /**
     * One POST of the page (ACTION.request) and its JSON answer when `accept` takes it; anything
     * else (unreachable, unreadable, a shape `accept` refuses) is `unreadable()`, the caller's own
     * refusal shape.
     */
    async function postRequest(path, payload, accept, unreadable) {
      try {
        const response = await fetch(new URL(path, document.baseURI).toString(), { ...ACTION.request, body: JSON.stringify(payload ?? {}) })
        const answer = await response.json()
        if (accept(answer)) return answer
      } catch { /* unreachable or unreadable: the refusal below */ }
      return unreadable()
    }

    /** One page action: `{ok, …}` as the route answers it, or `{ok: false, code: ACTION.unreadable}`. */
    const actionRequest = (path, payload) => postRequest(path, payload, (answer) => typeof answer?.ok === 'boolean', () => ({ ok: false, code: ACTION.unreadable }))

    /** A refusal's words: its own when known, else the code itself. */
    const refusalText = (t, prefix, code) => (Object.hasOwn(en, prefix + code) ? t(prefix + code) : t('refused', { code }))

    /**
     * Reconnect and Open Fishball (R11; Q-G3, Q7 = A). Reconnect is always shown (Q-B2). Open asks
     * for one admission under this page's own hostname and opens it in a new tab.
     */
    function Actions({ t, state, CLS, lang }) {
      const [view, setView] = React.useState({ busy: false })
      const ready = state === ACTION.ready
      const reconnect = async () => {
        setView({ busy: true })
        const answer = await actionRequest(ACTION.reconnectPath)
        setView({ busy: false, message: answer.ok ? t('reconnected') : refusalText(t, 'reconnectRefused.', answer.code), error: !answer.ok })
      }
      const open = async () => {
        const answer = await actionRequest(ACTION.openPath, { lang: ACTION.langs.includes(lang) ? lang : ACTION.fallbackLang })
        if (answer.ok && typeof answer.url === 'string') { window.open(answer.url, ACTION.target, ACTION.features); return }
        setView({ busy: false, message: refusalText(t, 'openRefused.', answer.code), error: true })
      }
      // One card row: the two actions on the left, Reconnect's hint and its outcome under them.
      return h('div', { className: CLS.card },
        h('div', { className: CLS.feature },
          h('div', { className: CLS.actions },
            h(Button, { type: 'button', size: 'sm', variant: 'primary', icon: h(IconRightUpOutlineRegular, { size: ICON_PX }), disabled: !ready, 'data-dsh-instance-open': true, onClick: () => void open() }, t('open')),
            h(Button, { type: 'button', size: 'sm', variant: 'outline', disabled: view.busy, 'aria-busy': view.busy, 'data-dsh-instance-reconnect': true, onClick: () => void reconnect() },
              view.busy ? t('reconnecting') : t('reconnect'))),
          h('p', { className: CLS.hint }, t('reconnectHint')),
          view.message ? h('p', { className: view.error ? CLS.error : CLS.hint, role: view.error ? 'alert' : 'status' }, view.message) : null))
    }

    /** One model-sync call. @returns `{ok, result|error}`; an unreadable answer is a typed refusal. */
    const syncAnswer = (answer) => (answer?.ok === true && answer.result !== null && typeof answer.result === 'object') || (answer?.ok === false && typeof answer.error?.code === 'string')
    const syncRequest = (path, payload) => postRequest(path, payload, syncAnswer, () => ({ ok: false, error: { code: MODEL_SYNC_UI.unreadable } }))

    /**
     * The "Model for Fishball" block (§10, D26): Check fetches once and lists only the providers the
     * instance lacks, each ticked; Add selected writes exactly the ticked ones; Cancel drops the
     * list (the host lets the check expire). Check is enabled only while the instance is `ready`.
     *
     * The block's state is one value: `{phase, check?, ticked?, items?, notice?, error?}`. `notice`
     * is a fixed message key; `error` a code shown with its own words or as itself.
     * @param t - this card's locale reader.
     * @param state - the instance state from the shared status poll.
     * @param CLS - every class the card draws (its own and the status line's).
     * @param neutralTone - the status line's Tag tone for an outcome with no tone of its own.
     * @param paths - `{check, add}`: the model-sync routes this card calls (MODEL_SYNC_UI).
     */
    function ModelSync({ t, state, CLS, neutralTone, paths }) {
      const P = MODEL_SYNC_UI.phase
      const [view, setView] = React.useState({ phase: P.idle })
      const ready = state === ACTION.ready
      const reason = (code) => (MODEL_SYNC_UI.reasons.includes(code) ? t('syncReason.' + code) : code)
      const check = async () => {
        setView({ phase: P.checking })
        const answer = await syncRequest(paths.check)
        if (!answer.ok) { setView({ phase: P.idle, error: answer.error.code }); return }
        setView({ phase: P.listed, check: answer.result, ticked: answer.result.missing.map((entry) => entry.id) })
      }
      const add = async () => {
        const { check: listed, ticked } = view
        setView({ ...view, phase: P.adding, error: undefined, notice: undefined })
        const answer = await syncRequest(paths.add, { checkId: listed.checkId, ids: ticked })
        if (answer.ok) {
          const unknown = answer.result.items.some((item) => item.reason === MODEL_SYNC_UI.unknownReason)
          setView({ phase: P.result, check: listed, items: answer.result.items, notice: unknown ? 'sync.unknown' : undefined })
          return
        }
        const code = answer.error.code
        // A busy Add leaves this check valid (the coordinator refuses before it consumes it), so
        // the list stays and the user can press Add again.
        if (code === MODEL_SYNC_UI.busy) { setView({ ...view, phase: P.listed, notice: 'sync.busy' }); return }
        // Nothing was written: the child restarted, stopped or changed since the check, or the
        // check expired. The list no longer describes the child, so it goes.
        if (MODEL_SYNC_UI.restarted.includes(code)) { setView({ phase: P.idle, notice: 'sync.restarted' }); return }
        setView({ phase: P.idle, error: code })
      }
      const toggle = (id, on) => setView((current) => ({ ...current, ticked: on ? [...current.ticked, id] : current.ticked.filter((other) => other !== id) }))
      const listed = view.phase === P.listed || view.phase === P.adding
      const busy = view.phase === P.checking || view.phase === P.adding
      const nameOf = (id) => view.check?.missing.find((entry) => entry.id === id)?.name ?? id
      const counts = view.items ? Object.values(MODEL_SYNC_UI.outcome).map((outcome) => [outcome, view.items.filter((item) => item.outcome === outcome).length]).filter(([, count]) => count > 0) : []
      // A titled section with one card row: Check, the state lines and the list under it.
      return h('section', { className: CLS.section },
        h('h3', { className: CLS.syncTitle }, t('sync.title')),
        h('div', { className: CLS.card },
        h('div', { className: [CLS.feature, CLS.sync].join(' '), 'data-fishball-model-sync': view.phase },
        h('div', { className: CLS.statusRow },
          h(Button, { type: 'button', size: 'sm', variant: 'outline', disabled: !ready || busy, 'aria-busy': view.phase === P.checking, 'data-fishball-model-check': true, onClick: () => void check() },
            view.phase === P.checking ? t('sync.checking') : view.phase === P.result ? t('sync.checkAgain') : t('sync.check'))),
        ready ? null : h('p', { className: CLS.hint, role: 'status' }, t('sync.notRunning')),
        view.error ? h('p', { className: CLS.error, role: 'alert' }, t('sync.refused', { code: view.error })) : null,
        view.notice ? h('p', { className: CLS.hint, role: 'status' }, t(view.notice)) : null,
        listed && view.check.missing.length === 0 ? h('p', { className: CLS.hint, role: 'status' }, t('sync.nothing')) : null,
        listed && view.check.missing.length > 0 ? h('ul', { className: CLS.syncList },
          view.check.missing.map((entry) => h('li', { key: entry.id, className: CLS.syncRow, 'data-fishball-model-entry': entry.id },
            // DSH's Checkbox: its label is the provider's name, in the list's own weight.
            h(Checkbox, { checked: view.ticked.includes(entry.id), disabled: busy, label: h('strong', null, entry.name), onChange: (on) => toggle(entry.id, on) }),
            h('p', { className: CLS.syncModels }, entry.models.length > 0 ? t('sync.models', { models: entry.models.join(', ') }) : t('sync.noModels'))))) : null,
        listed && view.check.missing.length > 0 ? h('div', { className: CLS.statusRow },
          h(Button, { type: 'button', size: 'sm', variant: 'primary', disabled: busy || view.ticked.length === 0 || !ready, 'data-fishball-model-add': true, onClick: () => void add() },
            view.phase === P.adding ? t('sync.adding') : t('sync.add')),
          h(Button, { type: 'button', size: 'sm', variant: 'ghost', disabled: busy, onClick: () => setView({ phase: P.idle }) }, t('sync.cancel'))) : null,
        view.phase === P.result ? h(React.Fragment, null,
          h('p', { role: 'status' }, counts.map(([outcome, count]) => t('sync.summary.' + outcome, { count })).join(MODEL_SYNC_UI.separator)),
          h('ul', { className: CLS.syncList }, view.items.map((item) => h('li', { key: item.id, className: CLS.syncRow, 'data-fishball-model-result': item.outcome },
            h('strong', null, nameOf(item.id)),
            h(Tag, { tone: MODEL_SYNC_UI.outcomeTone[item.outcome] ?? neutralTone }, t('sync.outcome.' + item.outcome)),
            item.reason ? h('span', { className: CLS.hint }, reason(item.reason)) : null)))) : null,
        (listed || view.phase === P.result) && view.check.present > 0 ? h('p', { className: CLS.hint }, t('sync.present', { count: view.check.present })) : null,
        (listed || view.phase === P.result) && view.check.notOffered.length > 0 ? h('details', null,
          h('summary', { className: CLS.hint }, t('sync.notOffered', { count: view.check.notOffered.length })),
          h('ul', { className: CLS.syncList }, view.check.notOffered.map((entry) => h('li', { key: entry.id, className: CLS.hint },
            h('strong', null, entry.name), ' — ', reason(entry.reason))))) : null,
        h('p', { className: CLS.hint }, t('sync.help')))))
    }

    /**
     * The page: the status line, the actions, the model block, then the `enabled` switch.
     * The switch stages a boolean; the actual parent cannot be overridden.
     * @param section - the staged form from {@link launchSection}.
     * @param t - this card's locale reader.
     * @param shared - the status-line module (client.status.js).
     * @param CLS - every class the card draws (its own and the status line's).
     * @param neutralTone - the status line's neutral Tag tone, for the model block.
     * @param paths - the model block's routes (see {@link ModelSync}).
     * @param activeLang - `() => string`, the page's active language for Open.
     * @returns the row page component.
     */
    function makeCard(section, t, shared, CLS, neutralTone, paths, activeLang) {
      const { InstanceStatus, useInstanceStatus } = shared
      const subscribe = section.store.subscribe.bind(section.store)
      const getSnapshot = () => section.store.getSnapshot()
      return function FishballInstanceCard(props) {
        const state = React.useSyncExternalStore(subscribe, getSnapshot)
        // One status poll for the status line and the model block (hooks before the early return).
        const [status, setStatus] = useInstanceStatus()
        if (props.view !== VIEW.page) return t('summary')
        const disabled = !state.writable || state.saving
        // DSH's section rhythm: the status card, Fishball's actions, the model sync, then the launch
        // settings in DSH's own form frame (its Save row under the card).
        return h('div', { className: CLS.page },
          h(InstanceStatus, { t, status, setStatus }),
          h('section', { className: CLS.section },
            h('h3', { className: CLS.sectionTitle }, t('actions')),
            h(Actions, { t, state: status?.state, CLS, lang: activeLang() })),
          h(ModelSync, { t, state: status?.state, CLS, neutralTone, paths }),
          h('section', { className: CLS.section },
          h('h3', { className: CLS.sectionTitle }, t('launch')),
          h(SettingsForm, {
          labels: formLabels(t),
          state,
          onSave: section.actions.save,
          onDiscard: section.actions.discard,
        },
          h('div', { key: FIELD.enabled, className: CLS.card },
          h('div', { className: CLS.feature },
            h('label', { className: CLS.toggleRow },
              h('span', { className: CLS.toggleText }, t('field.enabled')),
              h(Switch, {
                checked: state.fields[FIELD.enabled].text === FLAG.on,
                label: t('field.enabled'),
                disabled,
                onChange: (on) => section.actions.edit(FIELD.enabled, on ? FLAG.on : FLAG.off),
              })),
            h('p', { className: CLS.hint }, t('enabledHint')))))))
      }
    }

    /**
     * The page as a client plugin over the status line chunk (the instance's client.js loads both
     * chunks and starts the result as a sub-plugin of its row).
     * @param shared - the status-line module's `shared` export (client.status.js).
     * @param layout - its `layout` export: the line's classes, rules, tokens and neutral tone.
     */
    exports.instancePlugin = (shared, layout) => ({
      name: PLUGIN.id,
      inject: ['slots', 'locale', 'configForms'],
      apply(ctx) {
        const t = ctx.locale.bind(shared.locale)
        const words = shared.dictionaries
        ctx.effect(() => ctx.locale.register(shared.locale, { en: { ...words.en, ...en }, zh: { ...words.zh, ...zh } }), PLUGIN.id + ': dictionaries')
        // One sheet: the status line's rules and the page's own, under the line's sheet id.
        ctx.effect(() => shared.mountStyle(layout.style.id, layout.css + cardCss(layout.style)), PLUGIN.id + ': styles')
        const CLS = Object.freeze({ ...layout.classes, ...OWN_CLS })
        // Registered while the Host serves this row's settings namespace, so the row's Configure
        // control appears only where a configuration exists (the Plugins page asks slot keys for it).
        ctx.effect(() => {
          const section = launchSection(ctx.configForms.get(PLUGIN.id))
          const Card = makeCard(section, t, shared, CLS, layout.neutralTone, MODEL_SYNC_UI, () => ctx.locale.getLocale().active)
          const stopServing = ctx.configForms.whileServed([PLUGIN.id], () =>
            ctx.slots.inject(PLUGIN.slot, () => ctx.slots.register({
              name: PLUGIN.slot,
              key: PLUGIN.id,
              locale: shared.locale,
            }, Card)))
          return () => { stopServing(); section.dispose() }
        }, PLUGIN.id + ': settings page')
      },
    })
    /** Shared model-sync transport & vocabulary for `client.onboarding.js` (single source of truth). */
    exports.syncKit = Object.freeze({
      paths: MODEL_SYNC_UI,
      request: syncRequest,
    })
    return module.exports
  },
})
