/**
 * The heartbeat row's settings, live. DSH's settings service serves and writes only a Config field
 * declared `.volatile()` (dsh-settings volatileForm), and a change of such a field does not
 * remount the row: the Loader commits the new value into the running reference (`.get()`) and
 * emits `loader/volatile-update` to the row's fiber (cordis-plugin-loader Entry._commitVolatile).
 *
 * It lives here, not in fishball-shared, because fishball-heartbeat is its only Fishball-side user
 * (fishball-shared holds only modules two Fishball packages use; fishball-board's settings have no
 * reader, so they are not made live). Move it to fishball-shared when a second amenity needs it.
 * It restates dsh-connector-shared/live-settings (the two sides share no module): keep the two in step.
 *
 * A member that computes everything at apply from plain values (its timers, its servers) keeps
 * doing so through `runWithSettings`: its body runs as a child plugin of the row with a plain
 * snapshot of the settings, and a live change restarts that child, which reads the snapshot again.
 * The child is restarted, not the row's own fiber, because DSH's settings write answers with a
 * fresh describe that skips an entry whose fiber is not ACTIVE (dsh-settings describe): a row
 * restarting at that moment would make a save that persisted read as refused, and would withdraw
 * the row's settings page (configForms.whileServed) while it is open.
 */

/** The Loader's event for a volatile-only change of this row's config (both supported SDKs). */
const VOLATILE_UPDATE = 'loader/volatile-update'

/** A volatile field's current value; a plain value is accepted too, so direct construction works. */
const valueOf = (field) => (field !== null && typeof field === 'object' && typeof field.get === 'function' ? field.get() : field)

/**
 * The row config's top-level fields read now.
 * @param config - the row config Cordis passed to apply (volatile fields arrive as live references).
 * @returns a frozen `{field: value}` snapshot; a field's value is the reference's frozen snapshot.
 */
export function settingsSnapshot(config) {
  return Object.freeze(Object.fromEntries(Object.entries(config ?? {}).map(([field, value]) => [field, valueOf(value)])))
}

/**
 * Run a row's body over a plain snapshot of its settings, and again after each live change.
 *
 * A body that fails at the row's apply fails the row, as before. A body that fails after a live
 * change restarts the row, so the failure stays the row's own (the Plugins page shows it) as when
 * a settings change remounted the row.
 * @param ctx - the row's context (its apply's ctx).
 * @param config - the row config its apply received.
 * @param body - `(scope, settings) => void | Promise<void>`: the row's apply, with the child's
 *   context and the snapshot; every effect it registers ends with the child.
 * @returns a promise settled once the first run settled; it rejects with that run's startup error.
 */
export async function runWithSettings(ctx, config, body) {
  const child = ctx.plugin({ apply: (scope) => body(scope, settingsSnapshot(config)) })
  // The real fiber (`child` is a thenable view of it whose own properties must not be written).
  const fiber = child.ctx.fiber
  ctx.on(VOLATILE_UPDATE, () => {
    // Only the child's teardown and reload run here, asynchronously, after the Loader's emit.
    // A failed reload is already logged by the fiber; the row's own restart then fails the row.
    fiber.restart().catch(() => ctx.fiber.restart()).catch(() => {})
  })
  await child
}
