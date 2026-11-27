/**
 * The name of Fishball's message-to-user tool (src/manager/message-user.js; the user, 2026-11-21:
 * "sending a message to the user must require calling a dedicated tool"). In its own module, with
 * no import, so the persona (src/persona.js) reads it without
 * loading DSH's host packages, as reminder-tools.js does for the reminder tools.
 *
 * fishball-page's client (packages/core/ui/fishball-page/client.js `MESSAGE.tool`) restates this
 * name: the page is a classic browser module that imports nothing of core. Change both together.
 */
export const MESSAGE_TOOL = Object.freeze({
  send: 'message_user',
})
