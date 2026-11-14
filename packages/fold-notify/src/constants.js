/** Feature-owned fixed limits from the fold-notify design §10. */
export const PLUGIN = Object.freeze({ name: 'fishball-fold-notify' })
export const NOTIFY = Object.freeze({ maxChars: 4000, systemChars: 140 })
export const FOLD = Object.freeze({ previewChars: 80, previewTools: 3 })
export const BATCH = Object.freeze({ maxItems: 20 })
export const SEEN = Object.freeze({ dwellMs: 600, threshold: 0.5 })

export const TOOL = Object.freeze({
  name: 'notify_user',
  // Extension points §1: a missing service OR another apiVersion is an "older instance".
  // No Fishball contract module is imported for these values: this package must load with no
  // fishball-core and no connector installed (R-FB-06), so it cannot resolve `fishball-core/contracts`.
  // `appReady` is DSH's launcher readiness service (dsh profile-boot, both SDKs).
  host: Object.freeze({ service: 'fishballInstance', apiVersion: 1, serviceEvent: 'internal/service', appReady: 'appReady' }),
  recordType: 'plugin:fishball-fold-notify/notice', recordVersion: 1,
  sectionName: 'fishball-fold-notify', sectionOrder: 90,
  argumentKeys: Object.freeze(['message', 'important']),
})
/** R-FB-06: the one line the row logs when fishball-core is not there. */
export const LOG = Object.freeze({ coreMissing: 'fishball-core-missing' })
export const ERROR = Object.freeze({
  name: 'NotifyError', empty: 'notify-empty', tooLong: 'notify-too-long',
  invalid: 'notify-invalid', wrongSession: 'notify-wrong-session', unavailable: 'notify-unavailable',
})
export const TEXT = Object.freeze({
  description: 'Speak to the user. Only the text you pass here is shown to the user expanded and notifies them; everything else you write or do is folded into a one-line summary. Call it once when you have something the user should read: an answer, a result, a question for them, or a problem that needs them. Do not call it for progress you can keep to yourself. Write the whole message here; do not repeat it as plain text. Set important to true only when the user must act (approve, answer, decide or fix something); it makes their Fishball indicator flash until they read the message.',
  message: `The whole message for the user; after trimming, 1 to ${NOTIFY.maxChars} Unicode code points.`,
  important: 'True only when the user must act; defaults to false.',
  section: 'The user does not read your replies or your tool steps; they are folded away. When you need the user to read something, call notify_user with the whole message. Do it once per thing worth telling; stay silent otherwise. Questions for the user also go through notify_user. Mark a notice important only when the user has to act; never for news or results.',
  shown: 'Shown to the user.', shownImportant: 'Shown to the user as important.',
})
