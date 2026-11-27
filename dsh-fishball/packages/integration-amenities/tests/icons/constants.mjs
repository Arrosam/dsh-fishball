/**
 * Oracle values of the package-icon rows. They come from the requirement the lead relayed
 * (2026-11-21: every amenities package gets a plugin icon) and from DSH's own manifest-icon
 * reader, dsh-app-boot src/package-meta.ts (iconOf / readPluginMeta, read for the exact rule),
 * never from an implementation:
 * - each package declares a manifest "icon" naming an existing SVG under the package, listed in
 *   its "files" so it ships;
 * - DSH accepts it: a relative path with no URL scheme, inside the manifest's directory after
 *   realpath, a regular file of at most 256 KiB, embedded as a base64 data URL;
 * - it is a valid SVG (well-formed XML, an <svg> root with a viewBox) that renders in an <img> on
 *   light and dark themes, so it depends on no currentColor and no external reference, and runs
 *   no script;
 * - icons are distinct per package; the libraries declare none.
 * Integration half (2026-11-27, the test restructure): the same rules applied to fishball-core, the
 * family reference, and the distinctness and base rows across the amenities, fishball-core and
 * fishball-ui. A copy of fishball-amenities' tests/icons/constants.mjs, less its BVA and oracle rows
 * (those stay that package's own).
 */

export const ID = Object.freeze({
  manifest: 'PI-EP-01', shipped: 'PI-EP-02', meta: 'PI-EP-03', svg: 'PI-EP-04', contained: 'PI-EP-05', distinct: 'PI-EP-06',
  render: 'PI-RENDER-01', family: 'PI-CONSIST',
})

/** DSH's manifest-icon rule (package-meta.ts iconOf), the SVG case of it. */
export const RULE = Object.freeze({
  field: 'icon',
  files: 'files',
  manifest: 'package.json',
  extension: '.svg',
  dataPrefix: 'data:image/svg+xml;base64,',
  /** MAX_ICON_BYTES: 256 KiB, inclusive ("exceeds" refuses only a larger file). */
  maxBytes: 256 * 1024,
  /** A URL scheme, which DSH refuses as "must be a relative file path". */
  scheme: /^[A-Za-z][A-Za-z\d+.-]*:/u,
  parent: '..',
  negated: '!',
  dotSlash: './',
  slash: '/',
  anyBelow: '/**',
})

/** A valid SVG document an <img> renders. */
export const SVG = Object.freeze({
  root: 'svg',
  namespace: 'http://www.w3.org/2000/svg',
  xmlnsAttr: 'xmlns',
  viewBox: 'viewBox',
  viewBoxNumbers: 4,
  listSeparator: /[\s,]+/u,
  qualified: ':',
})

/** What an <img> never reaches or never runs (the requirement: no currentColor, no external reference, no script). */
export const CONTAINED = Object.freeze({
  script: 'script',
  eventAttr: /^on/iu,
  currentColor: /currentcolor/iu,
  /** Compared by local name, so xlink:href is href too. */
  hrefAttrs: Object.freeze(['href']),
  cssUrl: /url\(\s*(['"]?)([^'")]*)\1\s*\)/giu,
  cssImport: /@import/iu,
  stylesheet: /<\?xml-stylesheet/iu,
  /** References that stay inside the document: a fragment, or bytes embedded in it. */
  local: Object.freeze(['#', 'data:']),
})

/**
 * The browser check. The page background is CSS `Canvas` under the emulated scheme (Chromium:
 * white light, near-black dark), the surface an <img> sits on when no theme paints one.
 * Visible means at least one drawn pixel reaches WCAG 2.1 SC 1.4.11's 3:1 non-text contrast
 * against that background.
 */
export const RENDER = Object.freeze({
  schemes: Object.freeze(['light', 'dark']),
  colorScheme: 'light dark',
  blank: 'about:blank',
  /** The requirement names no area, so a row asserts only that the icon shows at all. */
  minVisiblePixels: 1,
  background: 'Canvas',
  canvasPx: 48,
  viewport: Object.freeze({ width: 200, height: 200 }),
  minContrast: 3,
  rgb: /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/u,
  channels: 4,
  channelMax: 255,
})

/** DSH's metadata reader (dsh-app-boot's built entry exports readPluginMeta) and the XML parser DSH ships. */
export const READER = Object.freeze({ package: 'dsh-app-boot', saxes: 'saxes' })

/** Throwaway folders: the resolution roots DSH reads from. Under the run's TMPDIR. */
export const TEMP = Object.freeze({ prefix: 'fbtest-package-icons-', modules: 'node_modules' })
