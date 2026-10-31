/**
 * Fishball's Messenger look, browser half (DESIGN §10c).
 *
 * Fishball's own browser half loads this file from GET /api/fishball/messenger/client.js and
 * mounts it as a child plugin while the look is on (spike S24b), with the config
 * `{ useAssistantSessionId, mark }`: a React hook for Fishball's session id, and the FishMark.
 * Disposing the plugin removes everything below, so the stock chat returns at once.
 *
 * 1. Input rows (spike S25). Occupants of `conversation.chat.node` for the message kinds, at a
 *    priority below DSH's, so they win their cell. For any session but Fishball's they render
 *    the next occupant (DSH's own row) with the same props, so other sessions are unchanged. In
 *    Fishball's session an input that came through Fishball's intake is wrapped in a bubble
 *    with its author, read from the message's `source.author` (spike S26); DSH's own row stays
 *    inside it, with its summary, actions and time.
 * 2. Fishball's replies, work rows and the composer (spike S27). DSH's reply row declares child
 *    slots only one entry may declare, so it cannot be wrapped; a stylesheet styles it through
 *    DSH's data attributes instead. Every rule is scoped to the conversation that holds the
 *    header marker below, so only Fishball's session is affected. If DSH renames those
 *    attributes, replies fall back to DSH's look; nothing breaks.
 * 3. Header marker: a session-header action that renders only for Fishball's session. It
 *    scopes the stylesheet and shows the fish, "Fishball" and "typing…" or "online".
 */
window.__ModuleLoader__.load({
  id: 'dsh-fishball-messenger',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NAME = 'dsh-fishball-messenger'
    const NS = 'fishball-messenger'
    const SLOT = Object.freeze({ node: 'conversation.chat.node', headerActions: 'conversation.session.header.actions' })
    /** The message kinds DSH's chat registers (user, steering, injected context, turn triggers). */
    const INPUT_KINDS = Object.freeze(['user', 'steering', 'context', 'turn-trigger'])
    /**
     * DSH's own message rows register with the 'chat' locale; ours use the same so they receive
     * the same props and can hand them on unchanged (spike S25).
     */
    const CHAT_LOCALE = 'chat'
    /** A keyed cell renders its lowest priority; DSH's rows use the default 0. */
    const ROW_PRIORITY = -1
    const DEFAULT_PRIORITY = 0
    const HEADER = Object.freeze({ id: 'fishball-messenger', order: 1 })
    /** Message sources DSH and Fishball give the inputs that reach Fishball (src/constants.js SOURCE). */
    const SOURCE_KIND = Object.freeze({ user: 'user', relay: 'agent-message', notice: 'fishball-notice' })
    /** Author kinds (src/constants.js INTAKE_KIND). */
    const AUTHOR_KIND = Object.freeze({ session: 'session', user: 'user', system: 'system', watch: 'watch', approval: 'approval', plugin: 'plugin' })
    /** Marker words shown after an author's name, by author kind. */
    const MARKER_KEY = Object.freeze({ [AUTHOR_KIND.watch]: 'finished', [AUTHOR_KIND.approval]: 'permissionRequest' })
    const ATTR = Object.freeze({ marker: 'data-fishball-messenger', author: 'data-fishball-author' })
    /** DSH's chat-row wrapper: one per row, siblings in transcript order. */
    const FLOW_ITEM = '[data-chat-flow-key]'
    const STYLE_ID = 'fishball-messenger-style'
    const AVATAR = Object.freeze({ sizePx: 28, fishPx: 20, headerPx: 16, saturation: '72%', lightness: '52%', hueTurn: 360, initials: 2 })
    const ACCENT = 'var(--fishball-messenger-accent)'
    /**
     * Your messages: a light tint and edge of Fishball's magenta, so you can find your own
     * messages at a glance. Fishball's replies stay neutral: they are read longest, and strong
     * colour there is tiring (owner's choice and reason, 2026-10-31).
     */
    const YOU_TINT = Object.freeze({ fill: '10%', edge: '40%' })
    /**
     * Other senders keep their own colour (owner's choice, 2026-10-31): the avatar hue, set on
     * the bubble as `variable`, colours the avatar and name and tints the bubble and its edge.
     * Fishball's own notices and replies stay neutral. Mid lightness keeps names readable on
     * both DSH themes.
     */
    const SENDER_COLOUR = Object.freeze({ variable: '--fbm-sender', fill: '16%', edge: '50%' })
    const tint = (colour, share) => `color-mix(in srgb,${colour} ${share},transparent)`

    const en = {
      you: 'You',
      notice: 'Fishball notice',
      anotherSession: 'Another session',
      untitled: 'Untitled session',
      finished: 'finished',
      permissionRequest: 'permission request',
      typing: 'typing…',
      online: 'online',
    }
    const zh = {
      you: '你',
      notice: 'Fishball 通知',
      anotherSession: '另一个会话',
      untitled: '未命名会话',
      finished: '已完成',
      permissionRequest: '权限请求',
      typing: '正在输入…',
      online: '在线',
    }

    const CLS = Object.freeze({
      incoming: 'fbm-incoming', sender: 'fbm-sender', mine: 'fbm-mine', avatar: 'fbm-avatar', spacer: 'fbm-spacer',
      body: 'fbm-body', name: 'fbm-name', marker: 'fbm-marker', bubble: 'fbm-bubble', you: 'fbm-you', quote: 'fbm-quote',
      fish: 'fbm-fish', header: 'fbm-header', headerFish: 'fbm-header-fish', headerName: 'fbm-header-name', status: 'fbm-status',
    })
    /** The name Fishball's replies and header show: a product name, the same in every language. */
    const FISHBALL_NAME = 'Fishball'

    /** An SVG data URL of the FishMark body, used as a CSS mask so it takes the theme's colour. */
    const markMask = (mark) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='${mark.viewBox}'><path d='${mark.body}'/></svg>`)}")`

    /**
     * The stylesheet. SCOPE matches only the conversation that shows the header marker, which
     * renders for Fishball's session alone; the header and the chat list share this slot (S27).
     * The bubble classes are ours and need no scope.
     */
    function stylesheet(mark) {
      const SCOPE = `[data-slot="main.conversation"]:has([${ATTR.marker}])`
      const REPLY = `${SCOPE} [data-chat-flow-kind="assistant-step"][data-chat-group-part="response"]`
      return [
        `:root{--fishball-messenger-accent:${mark.eyeColor}}`,
        `.${CLS.incoming}{display:flex;gap:8px;align-items:flex-start;margin:6px 20% 6px 0}`,
        `.${CLS.avatar},.${CLS.spacer}{flex:none;width:${AVATAR.sizePx}px;height:${AVATAR.sizePx}px}`,
        `.${CLS.avatar}{display:flex;align-items:center;justify-content:center;border-radius:50%;background:var(${SENDER_COLOUR.variable});color:#fff;font-size:11px;font-weight:700;overflow:hidden}`,
        `.${CLS.body}{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}`,
        `.${CLS.name}{font-size:12px;font-weight:600;color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere}`,
        `.${CLS.marker}{margin-left:6px;font-weight:400}`,
        `.${CLS.bubble}{padding:6px 12px;border-radius:4px 18px 18px 18px;background:var(--dsw-alias-bg-module-platform);border:1px solid var(--dsw-alias-border-l2)}`,
        `.${CLS.sender} .${CLS.name}{color:var(${SENDER_COLOUR.variable})}`,
        `.${CLS.sender} .${CLS.bubble}{background:${tint(`var(${SENDER_COLOUR.variable})`, SENDER_COLOUR.fill)};border-color:${tint(`var(${SENDER_COLOUR.variable})`, SENDER_COLOUR.edge)}}`,
        `.${CLS.mine}{display:flex;flex-direction:column;align-items:flex-end;margin:6px 0 6px 20%}`,
        `.${CLS.you}{font-size:12px;font-weight:600;color:${ACCENT}}`,
        // Your messages are DSH's rows, whose classes are generated, so they are matched only
        // inside our wrapper: the text bubble by its stable "_bubble" ending, and a forwarded
        // session's card as DSH's section element. If DSH changes either, that row keeps DSH's
        // colours; nothing else changes.
        `.${CLS.mine} [class$="_bubble"],.${CLS.mine}>section{background:${tint(ACCENT, YOU_TINT.fill)};border:1px solid ${tint(ACCENT, YOU_TINT.edge)}}`,
        `.${CLS.quote}{max-width:100%;margin:2px 0;padding:2px 8px;border-left:3px solid ${ACCENT};border-radius:4px;background:var(--dsw-alias-bg-module-platform);font-size:12px;color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere}`,
        // System notices: a small, muted fish (DESIGN §10c), in the theme's text colour.
        `.${CLS.fish}{flex:none;width:${AVATAR.sizePx}px;height:${AVATAR.fishPx}px;color:var(--dsw-alias-label-tertiary)}`,
        `.${CLS.header}{display:inline-flex;align-items:center;gap:4px;font-size:12px}`,
        `.${CLS.headerFish}{width:${AVATAR.headerPx}px;height:${AVATAR.headerPx}px;color:var(--dsw-alias-label-primary)}`,
        `.${CLS.headerName}{font-weight:600;color:${ACCENT}}`,
        `.${CLS.status}{color:var(--dsw-alias-label-tertiary)}`,
        `${REPLY}{position:relative;margin:6px 20% 6px 0;padding:24px 14px 8px 48px;border-radius:4px 18px 18px 18px;background:var(--dsw-alias-bg-module-platform);border:1px solid var(--dsw-alias-border-l2)}`,
        `${REPLY}::before{content:"";position:absolute;left:10px;top:8px;width:${AVATAR.sizePx}px;height:${AVATAR.sizePx}px;background:var(--dsw-alias-label-primary);-webkit-mask:${markMask(mark)} center/contain no-repeat;mask:${markMask(mark)} center/contain no-repeat}`,
        `${REPLY}::after{content:${JSON.stringify(FISHBALL_NAME)};position:absolute;left:48px;top:6px;font-size:12px;font-weight:600;color:${ACCENT}}`,
        // Work rows (tool calls, reasoning, process groups) read as quieter activity lines.
        `${SCOPE} [data-chat-group-part]:not([data-chat-group-part="response"]){opacity:.7}`,
        `${SCOPE} [data-slot="conversation.composer.bar"]>*{border-radius:24px}`,
      ].join('')
    }

    /** A stable hue for a seed (session id or source identity), so a sender keeps its colour. */
    function hueOf(seed) {
      let hash = 0
      for (const ch of seed) hash = (hash * 31 + ch.codePointAt(0)) >>> 0
      return hash % AVATAR.hueTurn
    }

    /** Up to two initials from a name, one per word. */
    const initialsOf = (name) => name.trim().split(/\s+/).slice(0, AVATAR.initials).map((word) => [...word][0] ?? '').join('').toUpperCase()

    /**
     * Who sent a row's message, or undefined when the row is not an input to Fishball (DSH's own
     * context rows stay as they are).
     * @returns { key, name, mine, fish, seed, marker }; key groups consecutive bubbles.
     */
    function authorOf(source, t) {
      const author = source?.author
      // Any session's source is data from that session: use only parts of the expected type, so a
      // malformed one falls back instead of breaking the row.
      const text = (value) => (typeof value === 'string' && value.length > 0 ? value : undefined)
      if (source?.kind === SOURCE_KIND.user || author?.kind === AUTHOR_KIND.user) return { key: AUTHOR_KIND.user, name: t('you'), mine: true, quote: text(author?.name) }
      if (author !== null && typeof author === 'object') {
        if (author.kind === AUTHOR_KIND.system) return { key: AUTHOR_KIND.system, name: t('notice'), fish: true }
        const name = text(author.name) ?? t('untitled')
        const seed = text(author.seed) ?? name
        const marker = MARKER_KEY[author.kind]
        return { key: `${author.kind}:${seed}`, name, seed, marker: marker && t(marker) }
      }
      // Messages from before the Messenger look carry no author (DESIGN §10c).
      if (source?.kind === SOURCE_KIND.relay) return { key: `${SOURCE_KIND.relay}:${source.senderSessionId}`, name: t('anotherSession'), seed: String(source.senderSessionId ?? '') }
      if (source?.kind === SOURCE_KIND.notice) return { key: AUTHOR_KIND.system, name: t('notice'), fish: true }
      return undefined
    }

    /**
     * Whether the row just above this one is from the same author, read from the DOM because
     * each row renders on its own. Checked after every render; a row loaded above later
     * (older history) is picked up when this row renders again.
     */
    function useGrouped(key) {
      const ref = React.useRef(null)
      const [grouped, setGrouped] = React.useState(false)
      React.useLayoutEffect(() => {
        const previous = ref.current?.closest(FLOW_ITEM)?.previousElementSibling
        const same = previous?.querySelector(`[${ATTR.author}]`)?.getAttribute(ATTR.author) === key
        if (same !== grouped) setGrouped(same)
      })
      return [ref, grouped]
    }

    /** The FishMark in the current text colour, with its eye. */
    function FishMark({ mark, className }) {
      return h('svg', { className, viewBox: mark.viewBox, 'aria-hidden': true },
        h('path', { d: mark.body, fill: 'currentColor' }), h('path', { d: mark.eye, fill: mark.eyeColor }))
    }

    function makeAvatar(mark) {
      return function Avatar({ author }) {
        if (author.fish) {
          return h(FishMark, { mark, className: CLS.fish })
        }
        return h('span', { className: CLS.avatar, 'aria-hidden': true }, initialsOf(author.name))
      }
    }

    function makeBubble(Avatar) {
      return function Bubble({ author, children }) {
        const [ref, grouped] = useGrouped(author.key)
        if (author.mine) {
          return h('div', { ref, className: CLS.mine, [ATTR.author]: author.key },
            grouped ? null : h('div', { className: CLS.you }, author.name),
            author.quote === undefined ? null : h('div', { className: CLS.quote }, author.quote), children)
        }
        // A sender with a seed gets its own colour; Fishball's notices (no seed) stay neutral.
        const coloured = author.seed !== undefined
        return h('div', {
          ref, [ATTR.author]: author.key,
          className: coloured ? `${CLS.incoming} ${CLS.sender}` : CLS.incoming,
          style: coloured ? { [SENDER_COLOUR.variable]: `hsl(${hueOf(author.seed)} ${AVATAR.saturation} ${AVATAR.lightness})` } : undefined,
        },
          grouped ? h('span', { className: CLS.spacer }) : h(Avatar, { author }),
          h('div', { className: CLS.body },
            grouped ? null : h('div', { className: CLS.name }, author.name, author.marker ? h('span', { className: CLS.marker }, author.marker) : null),
            h('div', { className: CLS.bubble }, children)))
      }
    }

    /**
     * The occupant this one shadows for a key: the lowest priority strictly above ours (DSH's row
     * when nothing else overrides it). Only entries above ours are considered, so an entry that
     * shadows ours and hands on to us can never be handed back to (no render loop).
     */
    function nextOccupant(slots, key) {
      let next
      for (const entry of slots.entries(SLOT.node)) {
        const priority = entry.options.priority ?? DEFAULT_PRIORITY
        if (entry.options.key !== key || priority <= ROW_PRIORITY) continue
        if (next === undefined || priority < (next.options.priority ?? DEFAULT_PRIORITY)) next = entry
      }
      return next
    }

    function makeInputRow(slots, key, Bubble, useAssistantSessionId, t) {
      function InputRow(props) {
        const assistantId = useAssistantSessionId()
        const next = nextOccupant(slots, key)
        // A kind with no occupant renders no row, as in DSH.
        const inner = next === undefined ? null : h(next.component, props)
        if (inner === null || props.sessionId !== assistantId) return inner
        const author = authorOf(props.node?.data?.source, t)
        return author === undefined ? inner : h(Bubble, { author }, inner)
      }
      return InputRow
    }

    function makeHeaderMarker(useAssistantSessionId, mark, t) {
      return function HeaderMarker({ sessionId, useSessionStatus }) {
        const assistantId = useAssistantSessionId()
        const running = useSessionStatus((statuses) => statuses.get(sessionId)?.running === true)
        if (!sessionId || sessionId !== assistantId) return null
        return h('span', { className: CLS.header, [ATTR.marker]: '' },
          h(FishMark, { mark, className: CLS.headerFish }),
          h('span', { className: CLS.headerName }, FISHBALL_NAME),
          h('span', { className: CLS.status }, t(running ? 'typing' : 'online')))
      }
    }

    function mountStyles(mark) {
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = stylesheet(mark)
      document.head.appendChild(style)
      return () => style.remove()
    }

    return {
      name: NAME,
      inject: ['slots', 'locale'],
      /** @param config - { useAssistantSessionId: () => string | null (a React hook), mark: FishMark }. */
      apply(ctx, { useAssistantSessionId, mark }) {
        const t = ctx.locale.bind(NS)
        ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'fishball-messenger: dictionaries')
        ctx.effect(() => mountStyles(mark), 'fishball-messenger: styles')
        const Bubble = makeBubble(makeAvatar(mark))
        ctx.effect(() => ctx.slots.inject(SLOT.node, function* () {
          for (const key of INPUT_KINDS) {
            yield ctx.slots.register({ name: SLOT.node, key, priority: ROW_PRIORITY, locale: CHAT_LOCALE }, makeInputRow(ctx.slots, key, Bubble, useAssistantSessionId, t))
          }
        }), 'fishball-messenger: input rows')
        ctx.effect(() => ctx.slots.inject(SLOT.headerActions, () => ctx.slots.register({ name: SLOT.headerActions, id: HEADER.id, order: HEADER.order }, makeHeaderMarker(useAssistantSessionId, mark, t))), 'fishball-messenger: header marker')
      },
    }
  },
})
