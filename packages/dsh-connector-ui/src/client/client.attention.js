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
    /** Cordis effect labels. */
    const LABEL = Object.freeze({ light: 'fishball: fish light', opened: 'fishball: clear on window open', notice: 'fishball: notify prompt' })

    /**
     * The part as a client plugin.
     * @param kit - the shell's kit (client.shell.js `kit`).
     * @param available - the host half's availability; `ui` holds the backend's page-relative routes.
     */
    function attentionPart(kit, available) {
      const { NS, SLOT, CLS, ROW_MARK, NOTICE_BUBBLE, SEAT, seats, snapshotHook, send, FishballIcon, attentionDot } = kit
      const routes = available.ui
      const useSnapshot = snapshotHook(routes)

      /** The sidebar fish with the backend's light: the dot while on, the animation while important. */
      function Mark({ size }) {
        const { light } = useSnapshot()
        return h('span', {
          className: CLS.markBox,
          'data-fishball-fish-light': light.on ? FISH.on : FISH.off,
          ...(light.important ? { 'data-fishball-fish-important': true } : {}),
        },
          h(FishballIcon, { size, unread: light.important }),
          light.on ? attentionDot(ROW_MARK.dot.lit) : null)
      }

      /**
       * Where the bubble sits: beside the sidebar fish when it is on screen (with its tail toward
       * the fish), else in the window's bottom-left corner (NOTICE_BUBBLE). Read at each render: the
       * sidebar can move or close. @returns `{place, style}`.
       */
      function bubblePlace() {
        const mark = document.querySelector(NOTICE.markSelector)?.getBoundingClientRect()
        if (mark === undefined || mark.width === 0) return { place: NOTICE_BUBBLE.place.corner, style: { left: NOTICE_BUBBLE.edgePx, bottom: NOTICE_BUBBLE.edgePx } }
        return { place: NOTICE_BUBBLE.place.mark, style: { left: mark.right + NOTICE_BUBBLE.gapPx, top: mark.top } }
      }

      /**
       * The notify prompt (R-FN-01). The message is a text child, so React shows markup as text;
       * the count is the backend's, since the user last clicked or opened the window. The status
       * region stays mounted with or without a notice, so a screen reader announces a notice that
       * appears in it; the button's name is one dictionary template with the count and the message.
       */
      function makeNotice(t) {
        return function FishballNotice() {
          const { notice } = useSnapshot()
          const at = notice === null ? null : bubblePlace()
          return h('div', { role: 'status', 'data-fishball-notice-region': true },
            notice === null ? null : h('button', {
              type: 'button', className: CLS.notice, style: at.style, 'data-fishball-notice-place': at.place,
              'aria-label': t('noticeLabel', { count: notice.count, message: notice.message }),
              'data-fishball-notice': true,
              ...(notice.important ? { 'data-fishball-notice-important': true } : {}),
              onClick: () => void send(routes.dismiss, {}),
            },
              h('span', { className: CLS.noticeText }, notice.message),
              h('span', { className: CLS.noticeCount, 'data-fishball-notice-count': notice.count, 'aria-hidden': true }, String(notice.count))))
        }
      }

      /** The window opened (the shell calls it once per mount): the backend clears the latch and the prompt. */
      const windowOpened = () => { void send(routes.opened, {}) }

      return {
        name: PART.name,
        inject: PART.inject,
        apply(ctx) {
          const t = ctx.locale.bind(NS)
          ctx.effect(() => seats.register(SEAT.mark, Mark), LABEL.light)
          ctx.effect(() => seats.register(SEAT.pageOpened, windowOpened), LABEL.opened)
          ctx.effect(() => ctx.slots.inject(SLOT.overlay, () => ctx.slots.register({ name: SLOT.overlay, id: NOTICE.id, locale: NS }, makeNotice(t))), LABEL.notice)
        },
      }
    }

    module.exports = { attentionPart }
    return module.exports
  },
})
