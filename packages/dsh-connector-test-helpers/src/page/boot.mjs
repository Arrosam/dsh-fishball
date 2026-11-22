/** DSH's boot page and client loader as served client bundles see them (dsh-client-modules). */
import path from 'node:path'

export const BOOT = Object.freeze({
  graph: /globalThis\["__DSH_BOOT__"\]\s*=\s*(\{.*?\});?\s*<\/script>/s,
  sdkScope: '@deepseek-ai/',
  chunkUrl: (id, file, rev) => `plugins/${id}/${file}?rev=${rev}`,
  clientFile: /^client(?:\.[\w-]+)?\.js$/,
  /** The platform modules a classic client script may require. */
  platform: Object.freeze({ react: 'react', reactDom: 'react-dom', reactDomClient: 'react-dom/client', primitives: '@deepseek-ai/dsh-client-ui-primitives' }),
  /** Services a scripted page provides by default (others stay absent). */
  services: Object.freeze(['slots', 'layout', 'locale']),
  cordisEntry: path.join('@deepseek-ai', 'cordis', 'lib', 'index.js'),
})

/** Cordis fiber states (cordis lib/types/fiber.d.ts). */
export const FIBER = Object.freeze({ pending: 0, active: 2, failed: 3 })

/** The served bundle text without DSH's source-map trailer (dsh-client-modules appends `\n;\n//# sourceMappingURL=…`). */
const TRAILER = /\s*;?\s*\/\/# sourceMappingURL=\S*\s*$/
export const servedSource = (text) => text.replace(TRAILER, '').trimEnd()
