/**
 * fishball-embed-ui, the attention part (V3 U-SHELL split; U-ATTN owns it from W4): the fish's
 * unread latch as the sidebar mark shows it (the fish, its wag and its dot), the frame's unread
 * count, and the latch's clear when the Fishball page opens (design §4.2, §13.6; D3). Moved
 * unchanged from the V2 connector client (R-EMBED's client.connector.js); the latch is still the
 * connector's V2 `unread` field and its attention-read route, read through the shell's kit.
 *
 * A package-local chunk beside client.js (DSH serves only flat client.<name>.js chunks, the
 * CLIENT_CHUNK rule of dsh-client-modules on both SDKs; no build step). It draws nothing of its
 * own: it fills three of the shell's seats (kit.SEAT), so the shell's sidebar row and frame
 * show it without knowing this part, and a part that never loads leaves the shell's fallbacks.
 */
globalThis.__ModuleLoader__?.load({
  id: 'fishball-embed-ui',
  chunk: 'client.attention.js',
  factory(require) {
    const module = { exports: {} }
    const React = require('react')
    const { Tag } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement
    /** The part's sub-plugin: its name and the client services it reads (none: it fills seats only). */
    const PART = Object.freeze({ name: 'fishball-embed-ui: attention', inject: Object.freeze([]) })

    /**
     * The part as a client plugin over the shell's kit (client.shell.js `kit`).
     * @param kit - the shell's shared state stream, helpers, vocabulary and seats.
     * @returns a client plugin; the shell starts it as a sub-plugin of its row.
     */
    function attentionPart(kit) {
      const { API, CLS, EMBED_UI, ROW_MARK, UNREAD_BADGE, SEAT, seats, useFishball, send, brandIconOf, attentionDot, unreadCount } = kit

      /** The unread count in words, capped so the pill stays narrow. */
      const unreadText = (t, count) => count > UNREAD_BADGE.max ? t('unreadMany', { max: UNREAD_BADGE.max }) : String(count)

      /** The sidebar row's mark: the chosen icon, wagging while important, and the latch's dot. */
      function Mark({ size }) {
        const state = useFishball()
        const count = unreadCount(state)
        const Icon = brandIconOf(state)
        return h('span', { className: CLS.markBox, 'data-fishball-unread': count },
          h(Icon, { size, unread: count > 0 && state.unread?.important === true, badge: true }),
          count > 0 ? attentionDot(ROW_MARK.dot.unread) : null)
      }

      /** Fishball's unread count in the frame: the sidebar mark's own count and cap, absent at 0. */
      function FrameUnread({ t }) {
        const count = unreadCount(useFishball())
        if (count === 0) return null
        return h('span', { 'data-fishball-frame-unread': count, 'aria-label': t('frameUnread', { count }) },
          h(Tag, { tone: EMBED_UI.neutralTone }, unreadText(t, count)))
      }

      /**
       * The page opened: clear the latch once. The shell calls it once per mount of its view, not
       * on every snapshot or iframe refresh. No instance feedback.
       */
      const pageOpened = () => { void send(API.attentionRead, {}) }

      return {
        name: PART.name,
        inject: PART.inject,
        apply(ctx) {
          ctx.effect(() => seats.register(SEAT.mark, Mark), 'fishball: attention mark')
          ctx.effect(() => seats.register(SEAT.frameBadge, FrameUnread), 'fishball: attention frame count')
          ctx.effect(() => seats.register(SEAT.pageOpened, pageOpened), 'fishball: attention clear on open')
        },
      }
    }

    module.exports = { attentionPart }
    return module.exports
  },
})
