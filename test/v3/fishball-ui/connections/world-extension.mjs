/**
 * fishball-ui.connections' extension of the manager world (../../fishball-core/manager/world.mjs,
 * FBTEST_WORLD_EXTENSION): fishball-taskboard installed as a selected bundle beside core (as DSH's
 * native add installs it), the scripted models image-capable (R7's image send), and ops that drive
 * core's Host registration `fishballInstance.page.register(topic, provider)` (R3) with fake amenity
 * topics, as an amenity row would through the fishballInstance service.
 *
 * A fake topic's provider is `{frame(url), onChange(fn)}`: `frame` answers the topic's current value
 * (or throws, when the case says so) and records the URL it was asked with; `change` sets a new value
 * and tells every onChange listener.
 */
import { TASKBOARD } from './constants.mjs'

const IMAGE_MODALITIES = Object.freeze(['text', 'image'])
const FAILURE = 'fbtest provider failure'

/** Installs fishball-taskboard on the first start (world.mjs's install, with the package folder). */
export function install(installPackage) {
  installPackage(TASKBOARD.moduleId, true, TASKBOARD.folder)
}

/** Before DSH boots: the scripted models accept images (R7's image send). */
export function prepare({ model }) {
  model.inputModalities = IMAGE_MODALITIES
}

export function ops({ ctx, instance, model }) {
  const topics = new Map()
  const describe = (error) => ({ name: error?.name ?? null, message: String(error?.message ?? error) })
  const providerOf = (entry) => ({
    frame(url) {
      entry.urls.push(String(url))
      if (entry.throws) throw new Error(FAILURE)
      return entry.value
    },
    onChange(fn) { entry.listeners.add(fn); return () => entry.listeners.delete(fn) },
  })
  return {
    /** R3: the Host face: apiVersion and whether `page.register` is a function. */
    pageFace: () => ({ apiVersion: instance()?.apiVersion ?? null, register: typeof instance()?.page?.register }),
    /** Registers one fake topic; answers {ok} or the thrown error's name and message. */
    pageRegister({ topic, value = null, throws = false }) {
      const entry = { value, throws, urls: [], listeners: new Set(), dispose: null }
      try {
        entry.dispose = instance().page.register(topic, providerOf(entry))
      } catch (error) {
        return { ok: false, error: describe(error) }
      }
      topics.set(topic, entry)
      return { ok: true, dispose: typeof entry.dispose }
    },
    /** Registers `topic` with a malformed argument pair (R3's TypeErrors); answers the thrown error, or null. */
    pageRegisterRaw({ topic, provider }) {
      const shapes = {
        none: undefined, null: null, string: 'fbtest-provider', noFrame: { onChange: () => () => {} },
        noOnChange: { frame: () => null }, frameNotFn: { frame: 1, onChange: () => () => {} },
      }
      try {
        const dispose = instance().page.register(topic, Object.hasOwn(shapes, provider) ? shapes[provider] : providerOf({ value: null, urls: [], listeners: new Set() }))
        if (typeof dispose === 'function') dispose()
        return null
      } catch (error) {
        return describe(error)
      }
    },
    /** A new value for a fake topic, told to its onChange listeners. */
    pageChange({ topic, value }) {
      const entry = topics.get(topic)
      entry.value = value
      for (const fn of [...entry.listeners]) fn()
      return entry.listeners.size
    },
    /** The same value told again (R4: not re-sent). */
    pageTouch({ topic }) { const entry = topics.get(topic); for (const fn of [...entry.listeners]) fn(); return true },
    pageThrow({ topic, throws }) { topics.get(topic).throws = throws; return true },
    // The entry is kept after its dispose, so a case can still change its value (R4: nothing more is sent).
    pageDispose({ topic }) { topics.get(topic).dispose?.(); return true },
    pageDisposeAll() { for (const [topic, entry] of topics) { entry.dispose?.(); topics.delete(topic) } return true },
    pageUrls: ({ topic }) => topics.get(topic)?.urls ?? [],
    /** Every model request so far (R7: the model receives the send). */
    requestCount: () => model.requests.length,
    /** Whether a model request from index `from` on carries `text` (R7: the model received the send). */
    requestsCarry: ({ from, text }) => model.requests.slice(from).some((r) => JSON.stringify(r).includes(text)),
    /** The live root context (unused by cases; kept so an op can read DSH's services). */
    hasContext: () => Boolean(ctx),
  }
}