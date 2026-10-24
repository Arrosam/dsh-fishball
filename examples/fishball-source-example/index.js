/**
 * Example ctx.fishball source (dsh-fishball DESIGN §8).
 *
 * It registers one source, "notes", and publishes each note of its config once: a note's id is
 * its dedupe key, so restarting DSH or saving the same list again sends nothing twice. Its list
 * is short; a source with a long history should publish only items newer than what it last sent
 * (dedupe covers the recent past, not everything ever sent; see the author guide).
 * Edit the notes on this plugin's page under Plugins: saving reloads the plugin (the list is not
 * a live setting), and each new id reaches Fishball as one event.
 *
 * The 'fishball' service is optional here: the plugin declares no static inject for it and
 * waits with ctx.inject(['fishball'], …), so without Fishball (or before it is loaded) it does
 * nothing, and it starts publishing once the service appears.
 */
import Schema from '@deepseek-ai/schemastery'

export const name = 'fishball-source-example'


export const Config = Schema.object({
  notes: Schema.array(Schema.object({
    id: Schema.string().required().description('Unique id; the dedupe key.'),
    title: Schema.string().required().description('One line, at most 120 characters.'),
    body: Schema.string().required().description('The note text.'),
    occurredAt: Schema.string().description('When it happened: ISO 8601 with an offset (optional).'),
  })).default([]).description('Notes to tell Fishball about, once each.'),
})

/** What this source is called on Fishball's settings page and in its notices. */
const SOURCE = Object.freeze({ id: 'notes', title: 'Example notes' })

export function apply(ctx, config) {
  const logger = ctx.logger('fishball-source-example')
  ctx.inject(['fishball'], (fishballCtx) => {
    let source
    try {
      source = fishballCtx.fishball.registerSource({ ...SOURCE, description: 'Notes from the example plugin config.' })
    } catch (error) {
      logger.warn('source not registered (%s)', error?.code ?? 'error')
      return
    }
    const publishAll = async () => {
      for (const note of config.notes ?? []) {
        try {
          const result = await source.publish({ dedupeKey: note.id, title: note.title, body: note.body, ...(note.occurredAt ? { occurredAt: note.occurredAt } : {}) })
          logger.info('note %s: %s', note.id, result.status)
        } catch (error) {
          // A stable code (e.g. FISHBALL_TOO_LARGE, FISHBALL_QUEUE_FULL); try again on the next change.
          logger.warn('note %s refused (%s)', note.id, error?.code ?? 'error')
        }
      }
    }
    // Fishball may not be live yet when this loads (or may turn this plugin on later): publish
    // whenever the source becomes enabled; dedupe keys make republishing this short list safe.
    source.onEnabled(() => { void publishAll() })
    if (source.enabled) void publishAll()
  })
}
