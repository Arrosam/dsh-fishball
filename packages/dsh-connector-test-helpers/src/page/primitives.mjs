/** A fake `@deepseek-ai/dsh-client-ui-primitives` for scripted pages: Button is a host <button>, every other export a generic element; all props are kept. */

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