/**
 * This package's extension of the fishball-test-helpers DSH world (child side, loaded in the booted
 * DSH): the scripted models take images (the image send), and ops that drive core's published Host
 * registration `fishballInstance.page.register(topic, provider)` (DESIGN §34) with fake amenity topics,
 * as an amenity row would. A fake topic's provider is `{frame(url), onChange(fn)}`: `frame` answers
 * the current value (or throws, when the case says so) and records the URL it was asked with.
 */
import { NAMES } from './names.mjs'

export function prepare({ model }) { model.inputModalities = NAMES.imageModalities }
export const ready = ({ ctx }) => Boolean(ctx.get(NAMES.instance))

export function ops({ ctx, model }) {
  const instance = () => ctx.get(NAMES.instance)
  const topics = new Map()
  const describe = (error) => ({ name: error?.name ?? null, message: String(error?.message ?? error) })
  const providerOf = (entry) => ({
    frame(url) { entry.urls.push(String(url)); if (entry.throws) throw new Error(NAMES.providerFailure); return entry.value },
    onChange(fn) { entry.listeners.add(fn); return () => entry.listeners.delete(fn) },
  })
  const shapes = {
    none: undefined, null: null, string: 'fbtest-provider', noFrame: { onChange: () => () => {} },
    noOnChange: { frame: () => null }, frameNotFn: { frame: 1, onChange: () => () => {} },
  }
  return {
    /** The Host face: apiVersion and whether `page.register` is a function. */
    pageFace: () => ({ apiVersion: instance()?.apiVersion ?? null, register: typeof instance()?.page?.register }),
    pageRegister({ topic, value = null, throws = false }) {
      const entry = { value, throws, urls: [], listeners: new Set(), dispose: null }
      try { entry.dispose = instance().page.register(topic, providerOf(entry)) } catch (error) { return { ok: false, error: describe(error) } }
      topics.set(topic, entry)
      return { ok: true, dispose: typeof entry.dispose }
    },
    /** A malformed argument pair; answers the thrown error, or null. */
    pageRegisterRaw({ topic, provider }) {
      try {
        const dispose = instance().page.register(topic, Object.hasOwn(shapes, provider) ? shapes[provider] : providerOf({ value: null, urls: [], listeners: new Set() }))
        if (typeof dispose === 'function') dispose()
        return null
      } catch (error) { return describe(error) }
    },
    pageChange({ topic, value }) { const entry = topics.get(topic); entry.value = value; for (const fn of [...entry.listeners]) fn(); return entry.listeners.size },
    pageTouch({ topic }) { for (const fn of [...topics.get(topic).listeners]) fn(); return true },
    pageThrow({ topic, throws }) { topics.get(topic).throws = throws; return true },
    // Kept after its dispose, so a case can still change its value (nothing more must be sent).
    pageDispose({ topic }) { topics.get(topic).dispose?.(); return true },
    pageDisposeAll() { for (const [topic, entry] of topics) { entry.dispose?.(); topics.delete(topic) } return true },
    pageUrls: ({ topic }) => topics.get(topic)?.urls ?? [],
    requestCount: () => model.requests.length,
    requestsCarry: ({ from, text }) => model.requests.slice(from).some((r) => JSON.stringify(r).includes(text)),
  }
}
