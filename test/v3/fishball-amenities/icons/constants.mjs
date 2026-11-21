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
 * This file is the same in dsh-connector and dsh-fishball (the two sides import nothing of each
 * other); repo.mjs holds each repository's packages and helpers.
 */
import path from 'node:path'

export const ID = Object.freeze({
  manifest: 'PI-EP-01', shipped: 'PI-EP-02', meta: 'PI-EP-03', svg: 'PI-EP-04', contained: 'PI-EP-05', distinct: 'PI-EP-06',
  render: 'PI-RENDER-01', library: 'PI-DT-01', lint: 'PI-DT-02', visible: 'PI-DT-03', size: 'PI-BVA-01', family: 'PI-CONSIST',
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
  /** WCAG relative luminance. */
  luminance: Object.freeze({ r: 0.2126, g: 0.7152, b: 0.0722, threshold: 0.03928, low: 12.92, offset: 0.055, scale: 1.055, gamma: 2.4, flare: 0.05, max: 255 }),
  rgb: /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/u,
  channels: 4,
  noBrowser: 'no Chromium installed (FBTEST_CHROME or a Playwright headless shell): the render rows need a real <img>',
})

/** DSH's metadata reader of each SDK (dsh-app-boot's built entry exports readPluginMeta). */
export const READER = Object.freeze({ entry: path.join('node_modules', '@deepseek-ai', 'dsh-app-boot', 'lib', 'index.js'), saxes: 'saxes' })

/** Throwaway folders: the resolution base DSH reads from, npm's isolated home and cache. Under the run's TMPDIR. */
export const TEMP = Object.freeze({ prefix: 'fbtest-package-icons-', modules: 'node_modules', home: 'home', cache: 'npm-cache', userrc: 'userrc', globalrc: 'globalrc' })

/** npm pack lists what ships; scripts are skipped so the checkout is never written (no package here has a pack script). */
export const PACK = Object.freeze({ ignoreScripts: '--ignore-scripts', jsonStart: /^\[/mu, maxStdoutBytes: 16 * 1024 * 1024 })

/** PI-BVA-01: synthetic packages whose icon is exactly n bytes, read by DSH's reader. */
const SIZE_SVG = Object.freeze({ head: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><!--', tail: '--></svg>', pad: ' ' })
export const SIZE = Object.freeze({
  svg: SIZE_SVG,
  namePrefix: 'fbtest-icon-size-',
  file: './icon.svg',
  /** The boundary offsets from the limit: just under, on, just over. */
  offsets: Object.freeze([-1, 0, 1]),
  rows: Object.freeze([
    { partition: 'max - 1 byte', bytes: RULE.maxBytes - 1, accepted: true },
    { partition: 'exactly max (256 KiB)', bytes: RULE.maxBytes, accepted: true },
    { partition: 'max + 1 byte', bytes: RULE.maxBytes + 1, accepted: false },
  ].map(Object.freeze)),
})

/** PI-DT-02: the self-contained rule over synthetic SVGs (its own oracle check). */
const doc = (body) => '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 24 24">' + body + '</svg>'
export const LINT = Object.freeze([
  { partition: 'fixed hex fills', svg: doc('<rect width="24" height="24" fill="#101010"/>'), flagged: false },
  { partition: 'a currentColor comment only', svg: doc('<!-- currentColor never reaches an img --><path d="M0 0h1" stroke="#000"/>'), flagged: false },
  { partition: 'fill="currentColor"', svg: doc('<path d="M0 0h1" fill="currentColor"/>'), flagged: true },
  { partition: 'style with currentcolor', svg: doc('<path d="M0 0h1" style="stroke: currentcolor"/>'), flagged: true },
  { partition: '<style> sheet with currentColor', svg: doc('<style>path { fill: currentColor }</style><path d="M0 0h1"/>'), flagged: true },
  { partition: '<script>', svg: doc('<script>void 0</script>'), flagged: true },
  { partition: 'event handler attribute', svg: doc('<rect width="1" height="1" onload="void 0"/>'), flagged: true },
  { partition: 'href to http', svg: doc('<image href="https://example.invalid/a.png" width="1" height="1"/>'), flagged: true },
  { partition: 'xlink:href to file', svg: doc('<use xlink:href="file:///tmp/a.svg#a"/>'), flagged: true },
  { partition: 'href to a relative file', svg: doc('<use href="other.svg#a"/>'), flagged: true },
  { partition: 'href to a fragment', svg: doc('<defs><path id="a" d="M0 0h1"/></defs><use href="#a"/>'), flagged: false },
  { partition: 'href to embedded data', svg: doc('<image href="data:image/png;base64,AA==" width="1" height="1"/>'), flagged: false },
  { partition: 'fill url(#gradient)', svg: doc('<defs><linearGradient id="g"/></defs><rect width="1" height="1" fill="url(#g)"/>'), flagged: false },
  { partition: 'fill url(http…)', svg: doc('<rect width="1" height="1" fill="url(http://example.invalid/g.svg#g)"/>'), flagged: true },
  { partition: '<style> @import', svg: doc('<style>@import url(theme.css);</style>'), flagged: true },
  { partition: 'xml-stylesheet instruction', svg: '<?xml-stylesheet href="theme.css"?>' + doc('<path d="M0 0h1"/>'), flagged: true },
].map(Object.freeze))

/** PI-DT-03: the visibility measure over controls (a fixed black mark reads on light, not on dark). */
export const VISIBLE = Object.freeze([
  { partition: 'black mark', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><rect width="24" height="24" fill="#000000"/></svg>', light: true, dark: false },
  { partition: 'white mark', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><rect width="24" height="24" fill="#FFFFFF"/></svg>', light: false, dark: true },
  { partition: 'nothing drawn', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"/>', light: false, dark: false },
].map(Object.freeze))
