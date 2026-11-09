/** Feature-owned fixed limits from the fold-notify design §10. */
export const PLUGIN = Object.freeze({ name: 'fishball-fold-notify' })
export const NOTIFY = Object.freeze({ maxChars: 4000, systemChars: 140 })
export const FOLD = Object.freeze({ previewChars: 80, previewTools: 3 })
export const BATCH = Object.freeze({ maxItems: 20 })
export const SEEN = Object.freeze({ dwellMs: 600, threshold: 0.5 })
