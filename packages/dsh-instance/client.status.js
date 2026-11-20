/**
 * The instance's status line (task I1, inst-OQ-01; I-HOST): the state tag, the safe code, its
 * reason, the failed start's detail and Retry while the instance is `failed`, and the notice
 * Retry leaves when the hosted entry was deleted (R-HOST-10; R6 = B), polled from the instance's
 * status route. A chunk of the instance's own settings page (client.js): DSH's client modules serve
 * a package's `client.<name>.js` siblings of its `client.js` (CLIENT_CHUNK, both SDKs). It moved
 * here from `src/child-settings/` with I-HOST, when the page moved from dsh-connector-ui to the
 * instance (requirements 1.33 Q-D1 = B, R-ARCH-05), so no symlink is needed any more.
 */
window.__ModuleLoader__.load({
  id: 'dsh-instance',
  chunk: 'client.status.js',
  factory(require) {
    const React = require('react')
    const { Button, Modal, StateDot, Tag } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement

    /**
     * The status line's locale namespace, the instance's own (unchanged since V2). The main card
     * registers these words together with its own under it, because DSH's locale service refuses a
     * second dictionary for the same namespace and language.
     */
    const LOCALE = 'dsh-instance'
    /**
     * The instance's status (host.js status(), served by src/host/routes.js). The routes are relative to DSH's
     * page. Status has no event, so the open card re-reads it at the cadence the connector's frame
     * reads `status()` (conn-OQ-25: once a second), only while it is mounted and the tab is
     * visible, one read at a time. `unavailable` is the route's own answer for a state it cannot
     * read. `stateTone` maps a state to the DSH Tag tones the connector's frame uses.
     */
    const STATUS_UI = Object.freeze({
      statusPath: 'api/dsh-instance/status',
      retryPath: 'api/dsh-instance/retry',
      restartPath: 'api/dsh-instance/restart',
      /**
       * The states Restart shows in (the user, 2026-11-20: whenever the instance is on and the child
       * is ready, failed or stopped), and those it shows disabled in (starting, stopping). It is also
       * disabled while the status says a Fishball package operation runs (`busy`).
       */
      restartable: Object.freeze(['ready', 'failed', 'stopped']),
      restartMoving: Object.freeze(['starting', 'stopping']),
      read: Object.freeze({ method: 'GET', cache: 'no-store', credentials: 'same-origin' }),
      post: Object.freeze({ method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: Object.freeze({ 'content-type': 'application/json' }), body: '{}' }),
      pollMs: 1000,
      loading: 'loading',
      failed: 'failed',
      stateTone: Object.freeze({ ready: 'info', failed: 'danger' }),
      neutralTone: 'neutral',
      /**
       * DSH's StateDot per state (green running, red failed, grey at rest); a state not listed is
       * moving (starting, stopping, waiting, checking) and shows DSH's spinner. The Tag's words
       * carry the state, so the dot is never the only signal.
       */
      dot: Object.freeze({ ready: 'done', failed: 'error', stopped: 'idle', disabled: 'idle', unavailable: 'warning' }),
      pendingDot: 'ongoing',
      dotPx: 8,
      pendingDotPx: 12,
    })
    /** Classes the main card's model block reuses too (`statusRow`, `hint`), so their rules live once, here. */
    const CLS = Object.freeze({ status: 'fb-instance-status', statusRow: 'fb-instance-status-row', statusHead: 'fb-instance-status-head', statusTitle: 'fb-instance-status-title', hint: 'fb-instance-hint', code: 'fb-instance-code', card: 'fb-instance-card' })
    /**
     * Layout tokens shared with the main card's own rules. The sheet id is the V2 card's: each page
     * mounts one sheet under it (the main card mounts these rules plus its own). The look uses DSH's
     * theme tokens only (so light and dark follow DSH); DSH has no spacing tokens, so the gaps copy
     * its Plugins page (32px between sections, 12px inside one) and its settings rows (12px × 16px
     * in a layer-1 card with an l2 rule between rows).
     */
    const STYLE = Object.freeze({
      id: 'dsh-instance-style',
      gap: '16px',
      sectionGap: '32px',
      blockGap: '12px',
      stackGap: '6px',
      rowPadding: '12px 16px',
      hintSize: '12px',
      lineHeight: '1.5',
    })
    const css = [
      `.${CLS.hint}{margin:0;color:var(--dsw-alias-label-tertiary);font-size:${STYLE.hintSize};line-height:${STYLE.lineHeight}}`,
      `.${CLS.code}{font-family:var(--dsw-font-markdown-code-font-family);font-size:${STYLE.hintSize};color:var(--dsw-alias-label-secondary)}`,
      // A card of rows (DSH's settings list on a layer-1 surface); the status is the page's first card.
      `.${CLS.card}{display:grid;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);overflow:hidden}`,
      `.${CLS.card}>*{padding:${STYLE.rowPadding};min-width:0}`,
      `.${CLS.card}>*+*{border-top:.5px solid var(--dsw-alias-border-l2)}`,
      `.${CLS.statusHead}{display:flex;align-items:center;justify-content:space-between;gap:${STYLE.blockGap}}`,
      `.${CLS.statusTitle}{font:var(--dsw-font-s-strong-14);color:var(--dsw-alias-label-primary)}`,
      `.${CLS.statusRow}{display:flex;align-items:center;flex-wrap:wrap;gap:${STYLE.stackGap};color:var(--dsw-alias-label-primary);font:var(--dsw-font-xs-13);line-height:${STYLE.lineHeight}}`,
    ].join('')

    // Flat key→text maps (the locale service looks a key up verbatim).
    const en = {
      status: 'Status',
      'state.loading': 'checking',
      'state.disabled': 'disabled',
      'state.waiting': 'waiting',
      'state.starting': 'starting',
      'state.ready': 'running',
      'state.stopping': 'stopping',
      'state.stopped': 'stopped',
      'state.failed': 'failed',
      'state.unavailable': 'unavailable',
      'reason.PROFILE_INCOMPATIBLE': 'An enabled Fishball plugin cannot load in the instance, so it did not start. The detail names it and the reason.',
      'reason.INVALID_MAIN_HOME': 'The DSH home is not a canonical real path. Start DSH with a home that is its own real path, not one through a symlink such as /tmp (on macOS, /private/tmp rather than /tmp).',
      retry: 'Retry',
      retrying: 'Retrying…',
      restart: 'Restart',
      restarting: 'Restarting…',
      restartTitle: 'Restart Fishball?',
      restartDescription: 'Running work in Fishball stops and the Fishball window reloads.',
      restartCancel: 'Cancel',
      close: 'Close',
      'restartRefused.instance-disabled': 'The instance is switched off, so there is nothing to restart.',
      'restartRefused.busy': 'A Fishball plugin change is still running. Wait for it, then restart.',
      'notice.hosted-entry-deleted': 'The hosted token entry was deleted in the connector, so Retry created no token. To connect again, press Reconnect below, or generate a new token in the connector\'s settings and paste it into the token field in Fishball\'s settings, or use Connect there.',
    }
    const zh = {
      status: '状态',
      'state.loading': '检查中',
      'state.disabled': '已禁用',
      'state.waiting': '等待中',
      'state.starting': '启动中',
      'state.ready': '运行中',
      'state.stopping': '停止中',
      'state.stopped': '已停止',
      'state.failed': '失败',
      'state.unavailable': '无法读取',
      'reason.PROFILE_INCOMPATIBLE': '一个已启用的 Fishball 插件无法在实例中加载，所以实例没有启动。详情里写有它的名字和原因。',
      'reason.INVALID_MAIN_HOME': 'DSH home 不是规范的真实路径。请让 DSH 使用它自身的真实路径，而不是经过 /tmp 之类符号链接的路径（macOS 上应使用 /private/tmp，而不是 /tmp）。',
      retry: '重试',
      retrying: '正在重试…',
      restart: '重启',
      restarting: '正在重启…',
      restartTitle: '重启 Fishball？',
      restartDescription: 'Fishball 中正在进行的工作会停止，Fishball 窗口会重新加载。',
      restartCancel: '取消',
      close: '关闭',
      'restartRefused.instance-disabled': '实例已关闭，没有可重启的内容。',
      'restartRefused.busy': 'Fishball 插件更改仍在进行。请等它结束后再重启。',
      'notice.hosted-entry-deleted': '连接器中的托管 token 条目已被删除，所以重试没有创建 token。要重新连接，请点击下方的“重新连接”；或在连接器设置中生成新 token，粘贴到 Fishball 设置的 token 输入框；或在那里使用 Connect。',
    }

    /**
     * One read or Retry of the status route. @returns `{state, code, detail}`, or undefined when
     * the answer could not be read (the line then keeps what it showed).
     */
    async function statusRequest(path, init, signal) {
      try {
        const response = await fetch(new URL(path, document.baseURI).toString(), { ...init, signal })
        if (!response.ok) return undefined
        const value = await response.json()
        return value !== null && typeof value === 'object' && typeof value.state === 'string' ? value : undefined
      } catch { return undefined }
    }

    /** The instance's status while the line is mounted: read at once, then every STATUS_UI.pollMs. */
    function useInstanceStatus() {
      const [status, setStatus] = React.useState(undefined)
      React.useEffect(() => {
        const abort = new AbortController()
        let reading = false
        const poll = () => {
          if (reading || document.hidden) return
          reading = true
          void statusRequest(STATUS_UI.statusPath, STATUS_UI.read, abort.signal).then((next) => {
            if (next !== undefined && !abort.signal.aborted) setStatus(next)
          }).finally(() => { reading = false })
        }
        poll()
        const timer = setInterval(poll, STATUS_UI.pollMs)
        return () => { clearInterval(timer); abort.abort() }
      }, [])
      return [status, setStatus]
    }

    /**
     * Restart (the user, 2026-11-20): beside Retry, it restarts Fishball after a confirmation in
     * DSH's dialog. Shown while the instance is on and the child is ready, failed or stopped, and
     * shown disabled while it starts or stops or a Fishball package operation runs.
     */
    function RestartAction({ t, status, setStatus }) {
      const [confirming, setConfirming] = React.useState(false)
      const [restarting, setRestarting] = React.useState(false)
      const [refused, setRefused] = React.useState(null)
      const state = status?.state
      if (!STATUS_UI.restartable.includes(state) && !STATUS_UI.restartMoving.includes(state)) return null
      const disabled = restarting || STATUS_UI.restartMoving.includes(state) || status?.busy === true
      const restart = async () => {
        setConfirming(false)
        setRestarting(true)
        const next = await statusRequest(STATUS_UI.restartPath, STATUS_UI.post)
        setRestarting(false)
        if (next !== undefined) setStatus(next)
        setRefused(typeof next?.refused === 'string' ? next.refused : null)
      }
      const refusedKey = refused === null ? null : 'restartRefused.' + refused
      return h(React.Fragment, null,
        h(Button, { type: 'button', size: 'sm', variant: 'outline', disabled, 'aria-busy': restarting, 'data-fishball-instance-restart': true, onClick: () => setConfirming(true) },
          restarting ? t('restarting') : t('restart')),
        refusedKey !== null && Object.hasOwn(en, refusedKey) ? h('span', { className: CLS.hint, role: 'alert' }, t(refusedKey)) : null,
        h(Modal, {
          open: confirming,
          onClose: () => setConfirming(false),
          title: t('restartTitle'),
          closeLabel: t('close'),
          description: t('restartDescription'),
          footer: h(React.Fragment, null,
            h(Button, { type: 'button', variant: 'outline', onClick: () => setConfirming(false) }, t('restartCancel')),
            h(Button, { type: 'button', variant: 'primary', 'data-fishball-instance-restart-confirm': true, onClick: () => void restart() }, t('restart'))),
        }))
    }

    /**
     * The status line: DSH's Tag with the state, the safe code beside it, the reason (the
     * state's or the code's own text), Retry for `failed` and Restart (RestartAction).
     * @param t - a reader bound to {@link LOCALE}.
     * @param status - the polled status ({@link useInstanceStatus}), shared with the caller's other parts.
     */
    function InstanceStatus({ t, status, setStatus }) {
      const [retrying, setRetrying] = React.useState(false)
      const state = status?.state ?? STATUS_UI.loading
      const code = status?.code ?? null
      const reasonKey = ['reason.' + state, code === null ? null : 'reason.' + code].find((key) => key !== null && Object.hasOwn(en, key))
      const reason = reasonKey !== undefined ? t(reasonKey) : null
      const retry = async () => {
        setRetrying(true)
        const next = await statusRequest(STATUS_UI.retryPath, STATUS_UI.post)
        setRetrying(false)
        if (next !== undefined) setStatus(next)
      }
      const dot = STATUS_UI.dot[state]
      // A card: the status line (its title left, Retry right), then the reason, the detail and the
      // notice as its rows, each present only when there is something to say.
      return h('div', { className: [CLS.status, CLS.card].join(' '), 'data-fishball-instance-state': state, ...(code ? { 'data-fishball-instance-code': code } : {}) },
        h('div', { className: CLS.statusHead },
          h('div', { className: CLS.statusRow, role: 'status' },
            h('span', { className: CLS.statusTitle }, t('status')),
            h(Tag, { tone: STATUS_UI.stateTone[state] ?? STATUS_UI.neutralTone },
              h('span', { className: CLS.statusRow },
                dot === undefined ? h(StateDot, { state: STATUS_UI.pendingDot, size: STATUS_UI.pendingDotPx }) : h(StateDot, { state: dot, size: STATUS_UI.dotPx }),
                t('state.' + state))),
            code ? h('code', { className: CLS.code }, code) : null),
          // DSH's Button has no `secondary` variant (its variants: primary, ghost, outline, toolbar).
          h('div', { className: CLS.statusRow },
            state === STATUS_UI.failed
              ? h(Button, { type: 'button', size: 'sm', variant: 'primary', disabled: retrying, 'data-fishball-instance-retry': true, onClick: () => void retry() }, retrying ? t('retrying') : t('retry'))
              : null,
            h(RestartAction, { t, status, setStatus }))),
        reason ? h('p', { className: CLS.hint }, reason) : null,
        // A failed start's specific cause (host.js, already sanitized and bounded by the route).
        typeof status?.detail === 'string' && status.detail ? h('p', { className: CLS.hint, 'data-fishball-instance-detail': true }, status.detail) : null,
        // The one notice (host.js): a known key gets its words, anything else shows nothing.
        typeof status?.notice === 'string' && Object.hasOwn(en, 'notice.' + status.notice) ? h('p', { className: CLS.hint, role: 'status', 'data-fishball-instance-notice': status.notice }, t('notice.' + status.notice)) : null)
    }

    /** One page style sheet; DSH plugin styles are per page, and the id names the sheet. */
    function mountStyle(id, text) {
      const style = document.createElement('style')
      style.id = id
      style.textContent = text
      document.head.appendChild(style)
      return () => style.remove()
    }

    /**
     * What both pages use: the dictionaries under {@link LOCALE} (the caller registers them), the
     * line's styles, the poll and the line itself (unchanged since V2). RestartAction is shared too:
     * the Fishball tab on DSH's Plugins page draws the same Restart (the user, 2026-11-20: restart
     * Fishball easily after installing something), so both places keep one rule for when it shows.
     */
    const shared = Object.freeze({
      locale: LOCALE,
      dictionaries: Object.freeze({ en, zh }),
      mountStyles: () => mountStyle(STYLE.id, css),
      mountStyle,
      useInstanceStatus,
      InstanceStatus,
      RestartAction,
    })
    /**
     * What only the main card adds: the line's classes, rules, layout tokens and neutral tone, so
     * its model block reuses them and its one sheet holds the line's rules with its own.
     */
    const layout = Object.freeze({ classes: CLS, css, style: STYLE, neutralTone: STATUS_UI.neutralTone })
    return { shared, layout }
  },
})
