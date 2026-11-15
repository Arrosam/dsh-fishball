/**
 * dsh-connector-ui, the attention part (task U-DRAW; requirements 1.34, 1.38 Q-N1; R-UI-04,
 * R-FN-01; design §13.6): the sidebar fish's light, the notify prompt beside it, and the clear when
 * the window opens. It only draws (1.34): the latch and the notice are the connector UI backend's,
 * read from its snapshot stream; a click on the prompt and the window's opening are its routes.
 *
 * - The light: `light.on` (a set latch or a pending notice) puts the dot on the fish;
 *   `light.important` makes the fish animate (the important animation, §13.6).
 * - The prompt (R-FN-01): while there is a notice, a bubble beside the fish shows its message as
 *   plain text and how many arrived since the last click, styled as important when it is. A click
 *   dismisses it; a newer notice replaces it, as the backend's snapshot says.
 *
 * A package-local chunk beside client.js (DSH serves only flat client.<name>.js chunks, the
 * CLIENT_CHUNK rule of dsh-client-modules on both SDKs; no build step). It fills two of the
 * shell's seats (kit.SEAT) and one overlay entry, so a part that never loads leaves the shell's
 * plain fish.
 */
globalThis.__ModuleLoader__?.load({
  id: 'dsh-connector-ui',
  chunk: 'client.attention.js',
  factory(require) {
    const module = { exports: {} }
    const React = require('react')
    const h = React.createElement
    /** The part's sub-plugin: its name and the client services it reads. */
    const PART = Object.freeze({ name: 'dsh-connector-ui: attention', inject: Object.freeze(['slots', 'locale']) })
    /**
     * The prompt's overlay entry. `markSelector` finds the sidebar fish the bubble sits beside:
     * the mark's own box (data-fishball-fish-light is set only by this part's Mark).
     */
    const NOTICE = Object.freeze({ id: 'fishball-notice', markSelector: '[data-fishball-fish-light]' })
    /** The values of the fish's data attributes, so a test or a stylesheet reads its state. */
    const FISH = Object.freeze({ on: 'on', off: 'off' })

    /**
     * The part as a client plugin.
     * @param kit - the shell's kit (client.shell.js `kit`).
     * @param available - the host half's availability; `ui` holds the backend's page-relative routes.
     */
    function attentionPart(kit, available) {
      const { NS, SLOT, CLS, ROW_MARK, NOTICE_BUBBLE, SEAT, seats, useUi, send, FishballIcon, attentionDot } = kit
      const routes = available.ui
      const useSnapshot = () => useUi(routes.events)

      /** The sidebar fish with the backend's light: the dot while on, the animation while important. */
      function Mark({ size }) {
        const { light } = useSnapshot()
        return h('span', {
          className: CLS.markBox,
          'data-fishball-fish-light': light.on ? FISH.on : FISH.off,
          ...(light.important ? { 'data-fishball-fish-important': true } : {}),
        },
          h(FishballIcon, { size, unread: light.important, badge: true }),
          light.on ? attentionDot(ROW_MARK.dot.lit) : null)
      }

      /**
       * Where the bubble sits: beside the sidebar fish when it is on screen, else in the window's
       * bottom-left corner (NOTICE_BUBBLE). Read at each render: the sidebar can move or close.
       */
      function bubblePlace() {
        const mark = document.querySelector(NOTICE.markSelector)?.getBoundingClientRect()
        if (mark === undefined || mark.width === 0) return { left: NOTICE_BUBBLE.edgePx, bottom: NOTICE_BUBBLE.edgePx }
        return { left: mark.right + NOTICE_BUBBLE.gapPx, top: mark.top }
      }

      /**
       * The notify prompt (R-FN-01). The message is a text child, so React shows markup as text;
       * the count is the backend's, since the user last clicked or opened the window.
       */
      function makeNotice(t) {
        return function FishballNotice() {
          const { notice } = useSnapshot()
          if (notice === null) return null
          return h('button', {
            type: 'button', className: CLS.notice, style: bubblePlace(), 'aria-live': 'polite',
            'aria-label': t('noticeDismiss') + ': ' + notice.message,
            'data-fishball-notice': true,
            ...(notice.important ? { 'data-fishball-notice-important': true } : {}),
            onClick: () => void send(routes.dismiss, {}),
          },
            h('span', { className: CLS.noticeText }, notice.message),
            h('span', { className: CLS.noticeCount, 'data-fishball-notice-count': notice.count, 'aria-label': t('noticeCount', { count: notice.count }) }, String(notice.count)))
        }
      }

      /** The window opened (the shell calls it once per mount): the backend clears the latch and the prompt. */
      const windowOpened = () => { void send(routes.opened, {}) }

      return {
        name: PART.name,
        inject: PART.inject,
        apply(ctx) {
          const t = ctx.locale.bind(NS)
          ctx.effect(() => seats.register(SEAT.mark, Mark), 'fishball: fish light')
          ctx.effect(() => seats.register(SEAT.pageOpened, windowOpened), 'fishball: clear on window open')
          ctx.effect(() => ctx.slots.inject(SLOT.overlay, () => ctx.slots.register({ name: SLOT.overlay, id: NOTICE.id, locale: NS }, makeNotice(t))), 'fishball: notify prompt')
        },
      }
    }

    module.exports = { attentionPart }
    return module.exports
  },
})
