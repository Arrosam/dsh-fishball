/** Spike fixture: a loader row that uses ctx.fishball directly (P8 smoke checks its answers). */
export const name = 'fishball-spike-source-direct'
export function apply(ctx) {
  const results = (globalThis.__p8Direct ??= {})
  ctx.inject(['fishball'], async (fc) => {
    const s = fc.fishball.registerSource({ id: 'direct', title: 'Direct' })
    const run = async () => {
      if (results.ran) return
      results.ran = true
      results.first = await s.publish({ dedupeKey: 'k1', title: 'one', body: 'first' })
      results.again = await s.publish({ dedupeKey: 'k1', title: 'one', body: 'first' })
      try { fc.fishball.registerSource({ id: 'direct', title: 'Again' }) } catch (e) { results.dup = e.code }
      try { await s.publish({ dedupeKey: 'k2', title: 'x'.repeat(121), body: 'b' }) } catch (e) { results.longTitle = e.code }
      try { await s.publish({ dedupeKey: '', title: 't', body: 'b' }) } catch (e) { results.noKey = e.code }
      try { await s.publish({ dedupeKey: 'k3', title: 't', body: 'b', occurredAt: 'yesterday' }) } catch (e) { results.badTime = e.code }
      try { fc.fishball.registerSource({ id: 'bad id!', title: 't' }) } catch (e) { results.badId = e.code }
      for (let i = 0; i < 8; i++) { try { fc.fishball.registerSource({ id: 'extra' + i, title: 't' }) } catch (e) { results.limit = e.code; break } }
      results.done = true
    }
    s.onEnabled(() => { void run() })
    if (s.enabled) void run()
  })
}
