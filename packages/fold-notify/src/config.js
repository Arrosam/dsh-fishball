import Schema from '@deepseek-ai/schemastery'

/** The row's settings; DSH owns validation and persistence, not a second settings store. */
export const Config = Schema.object({
  foldDefault: Schema.boolean().default(true)
    .description('Fold Fishball\'s work by default.'),
  systemNotification: Schema.union(['off', 'when-hidden']).default('when-hidden')
    .description('System notification when the page is hidden.'),
  batchWindowMs: Schema.natural().max(10_000).default(1500)
    .description('Gather notices arriving within this many milliseconds (0 = off).'),
})
