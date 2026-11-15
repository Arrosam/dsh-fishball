/**
 * dsh-connector's browser half: its own plugin settings page, and nothing else (task
 * C-TOKENS-REVEAL; design §5.9; requirements 1.27, 1.28 R2; R-ARCH-03, R-CON-10, R-TOK-03, R-TOK-11).
 *
 * By the user's rule a plugin's own settings page is not "UI" ("不带UI的意思是不影响dsh本身的UI"), so
 * this entry registers exactly one thing: the Plugins page's `plugins.row.config` entry for the
 * connector's own row, `dsh-connector#dsh-connector`, while DSH serves that row's settings. No
 * sidebar, no other slot, no style element; it works with dsh-connector-ui uninstalled.
 *
 * The page shows the tokens list (label, switch, delete, reorder; one Save writes the list through
 * the row's DSH config form, so every list edit is an ordinary settings save the connector's sync
 * checks), a label field with **New token**, the duplicate notice (R3, R5), and the reveal modal.
 *
 * The reveal (R-TOK-11): New token POSTs `{label}` to the connector's owner-only create route; its
 * one answer carries the value. The value lives only in the modal's state, shown with **Copy** and
 * **Close** (Close works at any time, 1.33 Q-D3 B); closing drops it and nothing re-opens it. It is
 * never put in a URL, the settings document, the console or storage. The list refreshes from the
 * config form, which shows the new entry without a value.
 *
 * Not mounted yet: C-WIRE adds the package's `dsh.client` field and the settings schema (W4b).
 * The strings are this file's dictionaries: DSH's client loads no JSON, and the package's
 * locale/*.json hold only the Plugins page's `meta` text.
 */
window.__ModuleLoader__.load({
  id: 'dsh-connector',
  factory(require) {
    const React = require('react')
    const { Button, Modal, Switch } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement

    /**
     * The row's identity: the row id is the settings namespace DSH serves and the package name, so
     * the slot key is `<package>#<row id>` (design §5.9). `tokensField` is the settings list.
     */
    const PAGE = Object.freeze({
      id: 'dsh-connector',
      slot: 'plugins.row.config',
      locale: 'dsh-connector-tokens',
      tokensField: 'tokens',
      pageView: 'page',
      /** ConfigFormSnapshot.status when DSH does not serve the row's settings to this client. */
      unavailable: 'unavailable',
      effect: 'dsh-connector: settings page',
    })
    /**
     * The host half's routes, page-relative: the same paths as src/settings-page/constants.js
     * without the leading `/`. A browser chunk cannot import that Node module, so they are written
     * here once more: change both together.
     */
    const ROUTE = Object.freeze({
      create: 'api/dsh-connector/tokens/create',
      notice: 'api/dsh-connector/tokens/notice',
      post: Object.freeze({ method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: Object.freeze({ 'content-type': 'application/json' }) }),
      get: Object.freeze({ method: 'GET', cache: 'no-store', credentials: 'same-origin' }),
      /** The answer that could not be read: shown as this code. */
      unreadable: 'request-failed',
    })
    /** One settings-path write of the whole list (dsh-settings SettingsPathOpView). */
    const OP_SET = 'set'
    /** Scripting hooks (data attributes) for the page's parts. */
    const DATA = Object.freeze({
      root: 'data-dsh-connector-tokens',
      row: 'data-dsh-connector-token-row',
      newLabel: 'data-dsh-connector-new-label',
      newToken: 'data-dsh-connector-new-token',
      notice: 'data-dsh-connector-notice',
      reveal: 'data-dsh-connector-reveal',
      copy: 'data-dsh-connector-copy',
    })
    /** Inline layout over DSH's design tokens: the page adds no style sheet (R-ARCH-03). */
    const STYLE = Object.freeze({
      page: Object.freeze({ display: 'grid', gap: 'var(--dsw-space-3, 12px)', color: 'var(--dsw-alias-label-primary)', font: 'var(--dsw-font-xs-13)' }),
      row: Object.freeze({ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--dsw-space-2, 8px)' }),
      list: Object.freeze({ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--dsw-space-2, 8px)' }),
      hint: Object.freeze({ margin: 0, color: 'var(--dsw-alias-label-tertiary)' }),
      error: Object.freeze({ margin: 0, color: 'var(--dsw-alias-state-error-primary)' }),
      value: Object.freeze({ margin: 0, padding: 'var(--dsw-space-2, 8px)', font: 'var(--dsw-font-code-13, monospace)', overflowWrap: 'anywhere', userSelect: 'all' }),
    })
    /** The Copy button's outcome, by its message key. */
    const COPY = Object.freeze({ done: 'copied', failed: 'copyFailed' })
    /** A step in the list for the reorder buttons. */
    const MOVE = Object.freeze({ up: -1, down: 1 })

    const en = {
      summary: 'Tokens for agents that connect to this DSH.',
      title: 'Tokens',
      hint: 'Each agent gets its own token. A token is shown once, when it is created; nobody can view or edit it afterwards. To replace a token, delete it and create a new one.',
      empty: 'No tokens yet.',
      label: 'Label',
      enabled: 'On',
      up: 'Move up',
      down: 'Move down',
      remove: 'Delete',
      save: 'Save',
      saving: 'Saving…',
      discard: 'Discard',
      saveFailed: 'The settings were not saved.',
      readOnly: 'This deployment stores settings read-only.',
      unavailable: 'The connector is not loaded, so its tokens cannot be managed right now.',
      newLabel: 'Label for the new token',
      newToken: 'New token',
      creating: 'Creating…',
      createFailed: 'No token was created ({code}).',
      notice: 'These tokens are duplicated or were added by hand, so they refuse service until this is fixed: {labels}. Delete them and create new ones.',
      noticeSeparator: '; ',
      labelSeparator: ', ',
      revealTitle: 'Your new token',
      revealHint: 'Copy it now: this is the only time it is shown. If you lose it, delete the token and create a new one.',
      copy: 'Copy',
      copied: 'Copied',
      copyFailed: 'Copy failed; select the token and copy it by hand.',
      close: 'Close',
    }
    const zh = {
      summary: '连接到此 DSH 的 agent 所用的 token。',
      title: 'Token',
      hint: '每个 agent 使用自己的 token。token 只在创建时显示一次，之后任何人都无法查看或修改。要更换 token，请删除它并新建一个。',
      empty: '还没有 token。',
      label: '标签',
      enabled: '启用',
      up: '上移',
      down: '下移',
      remove: '删除',
      save: '保存',
      saving: '保存中…',
      discard: '放弃',
      saveFailed: '设置没有保存。',
      readOnly: '本部署的设置是只读的。',
      unavailable: '连接器未加载，暂时无法管理它的 token。',
      newLabel: '新 token 的标签',
      newToken: '新建 token',
      creating: '正在创建…',
      createFailed: '没有创建 token（{code}）。',
      notice: '这些 token 重复或是手动添加的，在修复之前拒绝服务：{labels}。请删除它们并新建。',
      noticeSeparator: '；',
      labelSeparator: '、',
      revealTitle: '你的新 token',
      revealHint: '请现在复制：它只显示这一次。如果丢失，请删除该 token 并新建一个。',
      copy: '复制',
      copied: '已复制',
      copyFailed: '复制失败；请选中 token 手动复制。',
      close: '关闭',
    }

    const routeUrl = (path) => new URL(path, document.baseURI).toString()
    /** One call to the host half: its JSON answer, or `{ok: false, code}` when it cannot be read. */
    async function call(path, init) {
      try {
        const answer = await (await fetch(routeUrl(path), init)).json()
        if (answer !== null && typeof answer === 'object' && typeof answer.ok === 'boolean') return answer
      } catch { /* unreachable or unreadable: the code below */ }
      return { ok: false, code: ROUTE.unreadable }
    }

    /** The settings list as the page edits it: `{label, enabled, key}` items only. */
    const listOf = (value) => (Array.isArray(value?.[PAGE.tokensField]) ? value[PAGE.tokensField] : [])
      .map((item) => ({ label: typeof item?.label === 'string' ? item.label : '', enabled: item?.enabled === true, key: typeof item?.key === 'string' ? item.key : '' }))
    const sameList = (a, b) => JSON.stringify(a) === JSON.stringify(b)

    /** The duplicate notice (R3, R5): labels only, one group per problem. */
    function Notice({ t, notice }) {
      if (notice === null) return null
      const labels = notice.labels.map((group) => group.join(t('labelSeparator'))).join(t('noticeSeparator'))
      return h('p', { style: STYLE.error, role: 'alert', [DATA.notice]: notice.code }, t('notice', { labels }))
    }

    /**
     * The one-time reveal (AUTH-ST-08): open while `value` is set. Copy writes the clipboard; Close
     * calls `onClose`, which drops the value from the page.
     */
    function Reveal({ t, value, onClose }) {
      const [copy, setCopy] = React.useState(null)
      const copyValue = async () => {
        try { await navigator.clipboard.writeText(value); setCopy(COPY.done) } catch { setCopy(COPY.failed) }
      }
      return h(Modal, {
        open: true,
        onClose,
        closeLabel: t('close'),
        title: t('revealTitle'),
        footer: h(React.Fragment, null,
          h(Button, { type: 'button', variant: 'outline', [DATA.copy]: true, onClick: () => void copyValue() }, t('copy')),
          h(Button, { type: 'button', variant: 'primary', onClick: onClose }, t('close'))),
      },
        h('p', { style: STYLE.hint }, t('revealHint')),
        h('pre', { style: STYLE.value, [DATA.reveal]: true }, value),
        copy === null ? null : h('p', { style: copy === COPY.done ? STYLE.hint : STYLE.error, role: 'status' }, t(copy)))
    }

    /** One list row: label, switch, reorder and delete, all staged until Save. */
    function TokenRow({ t, item, index, count, disabled, edit }) {
      return h('li', { style: STYLE.row, [DATA.row]: item.key },
        h('input', { type: 'text', 'aria-label': t('label'), value: item.label, disabled, onChange: (event) => edit.label(index, event.target.value) }),
        h(Switch, { checked: item.enabled, label: t('enabled'), disabled, onChange: (on) => edit.enabled(index, on) }),
        h(Button, { type: 'button', size: 'sm', variant: 'ghost', disabled: disabled || index === 0, onClick: () => edit.move(index, MOVE.up) }, t('up')),
        h(Button, { type: 'button', size: 'sm', variant: 'ghost', disabled: disabled || index === count - 1, onClick: () => edit.move(index, MOVE.down) }, t('down')),
        h(Button, { type: 'button', size: 'sm', variant: 'ghost', disabled, onClick: () => edit.remove(index) }, t('remove')))
    }

    /**
     * The page over DSH's host-owned `form` (`{state, mutate}`, plugin-manager slot-contract
     * ConfigPageForm) that the Plugins page hands its row entry (design §5.9): the page owner
     * refreshes `state`, so an accepted change, including the item `create` adds, re-renders it.
     * No form means DSH does not serve the row's settings to this client.
     */
    function makePage(t) {
      return function DshConnectorSettings(props) {
        const form = props.form
        const snapshot = form?.state
        const saved = listOf(snapshot?.value)
        const [draft, setDraft] = React.useState(null)
        const [busy, setBusy] = React.useState(false)
        const [problem, setProblem] = React.useState(null)
        const [notice, setNotice] = React.useState(null)
        const [newLabel, setNewLabel] = React.useState('')
        // The value of the token just created: only here, only until Close (R-TOK-11).
        const [revealed, setRevealed] = React.useState(null)
        const refreshNotice = React.useCallback(async () => {
          const answer = await call(ROUTE.notice, ROUTE.get)
          setNotice(answer.ok ? answer.notice ?? null : null)
        }, [])
        React.useEffect(() => { void refreshNotice() }, [refreshNotice, snapshot?.revision])
        if (props.view !== PAGE.pageView) return t('summary')
        if (snapshot === undefined || snapshot.status === PAGE.unavailable) return h('p', { style: STYLE.hint }, t('unavailable'))
        const list = draft ?? saved
        const dirty = draft !== null && !sameList(draft, saved)
        const disabled = !snapshot.writable || busy
        const stage = (change) => { setProblem(null); setDraft((current) => change([...(current ?? saved)])) }
        const edit = {
          label: (index, label) => stage((next) => { next[index] = { ...next[index], label }; return next }),
          enabled: (index, enabled) => stage((next) => { next[index] = { ...next[index], enabled }; return next }),
          remove: (index) => stage((next) => { next.splice(index, 1); return next }),
          move: (index, step) => stage((next) => { const [item] = next.splice(index, 1); next.splice(index + step, 0, item); return next }),
        }
        const save = async () => {
          setBusy(true)
          let accepted = false
          try { accepted = await form.mutate([{ op: OP_SET, path: [PAGE.tokensField], value: draft }], snapshot.revision) } catch { accepted = false }
          setBusy(false)
          if (accepted) setDraft(null)
          else setProblem(t('saveFailed'))
          await refreshNotice()
        }
        const create = async () => {
          setBusy(true)
          setProblem(null)
          const answer = await call(ROUTE.create, { ...ROUTE.post, body: JSON.stringify({ label: newLabel }) })
          setBusy(false)
          if (!answer.ok || typeof answer.value !== 'string') { setProblem(t('createFailed', { code: answer.code ?? ROUTE.unreadable })); return }
          setNewLabel('')
          setRevealed(answer.value)
        }
        return h('div', { style: STYLE.page, [DATA.root]: true },
          h('h3', null, t('title')),
          h('p', { style: STYLE.hint }, t('hint')),
          snapshot.writable ? null : h('p', { style: STYLE.hint }, t('readOnly')),
          h(Notice, { t, notice }),
          list.length === 0 ? h('p', { style: STYLE.hint }, t('empty')) : h('ul', { style: STYLE.list },
            list.map((item, index) => h(TokenRow, { key: item.key + index, t, item, index, count: list.length, disabled, edit }))),
          dirty ? h('div', { style: STYLE.row },
            h(Button, { type: 'button', size: 'sm', variant: 'primary', disabled, onClick: () => void save() }, busy ? t('saving') : t('save')),
            h(Button, { type: 'button', size: 'sm', variant: 'ghost', disabled: busy, onClick: () => { setDraft(null); setProblem(null) } }, t('discard'))) : null,
          h('div', { style: STYLE.row },
            h('input', { type: 'text', 'aria-label': t('newLabel'), placeholder: t('newLabel'), value: newLabel, disabled: disabled || dirty, [DATA.newLabel]: true, onChange: (event) => setNewLabel(event.target.value) }),
            h(Button, { type: 'button', size: 'sm', variant: 'outline', disabled: disabled || dirty || newLabel.trim() === '', [DATA.newToken]: true, onClick: () => void create() }, busy ? t('creating') : t('newToken'))),
          problem === null ? null : h('p', { style: STYLE.error, role: 'alert' }, problem),
          revealed === null ? null : h(Reveal, { t, value: revealed, onClose: () => setRevealed(null) }))
      }
    }

    function apply(ctx) {
      const t = ctx.locale.bind(PAGE.locale)
      ctx.effect(() => ctx.locale.register(PAGE.locale, { en, zh }), PAGE.effect)
      // Registered only while DSH serves the row's settings, so a deployment without the row shows
      // no trace of the page (the Plugins page asks slot keys for a configure control).
      ctx.effect(() => ctx.configForms.whileServed([PAGE.id], () =>
        ctx.slots.inject(PAGE.slot, () => ctx.slots.register({
          name: PAGE.slot,
          key: `${PAGE.id}#${PAGE.id}`,
          locale: PAGE.locale,
        }, makePage(t)))), PAGE.effect)
    }

    return { name: PAGE.id, inject: ['slots', 'locale', 'configForms'], apply }
  },
})
