/**
 * Fake `@deepseek-ai/dsh-client-ui-primitives` for the offline settings pages (test/v3/fishball-core/package/page.mjs,
 * packages/dsh-connector/ui/tests/contract/embed/page.mjs). The V2 SET panel harness that lived here (mountPanel) loaded the child's
 * hosted settings sections, which left with fishball-hosted-settings (REMOVE-WD, design §1.0).
 */

/** Primitives: Button is a host <button>, every other export a generic element; all props kept. Shared with test/v3/fishball-core/package/page.mjs. */
export function fakePrimitives(React) {
  const cache = new Map()
  const make = (name) => function Primitive({ children, ...rest }) {
    return React.createElement(name === 'Button' ? 'button' : 'div', { 'data-primitive': name, ...rest }, children)
  }
  const primitives = new Proxy({}, {
    get(_target, name) {
      if (typeof name === 'symbol' || name === 'then' || name === '__esModule') return undefined
      if (name === 'default') return primitives
      if (!cache.has(name)) cache.set(name, make(name))
      return cache.get(name)
    },
  })
  return primitives
}
