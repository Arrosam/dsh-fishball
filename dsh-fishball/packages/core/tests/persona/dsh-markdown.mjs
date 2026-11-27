/**
 * DSH's own markdown parser, run offline in Node (never another markdown library), from the current
 * DSH's shipped web frontend.
 *
 * The chat renders an assistant message with the renderer function of the web frontend bundle:
 * micromark's `fromMarkdown` with the gfm extension, DSH's own attention rule
 * (`cjkFriendlyAttention`) and the math extensions, and a small post-processing step. The bundle is
 * minified, so this module cuts that stretch of source out of the installed bundle verbatim (from the
 * post-processing function to the end of the parser function), writes it beside a copy of the
 * bundle's vendor chunk in a fresh temp folder, and imports it. What is not DSH's code:
 *  - a stub `document` while the vendor chunk loads (KaTeX reads `document.compatMode`; the entity
 *    decoder asks for an element), removed again after the import;
 *  - a stub for the one image-file-type helper the post-processing step calls (`undefined`: the step
 *    then leaves the tree alone; it only rewrites a paragraph that is a single local image path).
 * The mdast -> React step of the chat is not run: a `strong` node is what the chat shows as bold text.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { DSH_VERSION, dshPackageDir } from 'fishball-test-helpers/dsh'
import { DSH_MARKDOWN, MDAST } from './constants.mjs'

const extensionCount = (match) => match[4].split(DSH_MARKDOWN.extensionSeparator).length + match[5].split(DSH_MARKDOWN.extensionSeparator).length

/**
 * Build and import the current DSH's chat renderer.
 * @returns {Promise<{parse: (markdown: string) => object}>} throws, naming the shape that changed, when it cannot be built.
 */
export async function loadRenderer() {
  const assets = path.join(dshPackageDir(DSH_MARKDOWN.package), DSH_MARKDOWN.assets)
  const files = fs.readdirSync(assets)
  const indexName = files.find((f) => DSH_MARKDOWN.indexFile.test(f) && fs.readFileSync(path.join(assets, f), 'utf8').includes(DSH_MARKDOWN.marker))
  const vendorName = files.find((f) => DSH_MARKDOWN.vendorFile.test(f))
  if (!indexName || !vendorName) throw new Error('DSH ' + DSH_VERSION + ': no frontend bundle holds ' + DSH_MARKDOWN.marker)
  const source = fs.readFileSync(path.join(assets, indexName), 'utf8')
  const found = [...source.matchAll(DSH_MARKDOWN.parserPattern)].sort((a, b) => extensionCount(b) - extensionCount(a))[0]
  if (!found) throw new Error('DSH ' + DSH_VERSION + ': the parser function was not found in ' + indexName)
  const [parserText, parserName, postName] = found
  const start = source.indexOf('function ' + postName + '(')
  const imports = DSH_MARKDOWN.vendorImport.exec(source)?.[0]
  if (start < 0 || start > found.index || !imports) throw new Error('DSH ' + DSH_VERSION + ': the markdown stretch of ' + indexName + ' has an unexpected shape')
  const slice = source.slice(start, found.index + parserText.length)
  const imageKind = DSH_MARKDOWN.imageKindPattern.exec(slice)?.[1]
  const body = [
    imports.replace(DSH_MARKDOWN.vendorFrom, 'from"./' + DSH_MARKDOWN.vendorModule + '"'),
    imageKind ? 'const ' + imageKind + '=()=>undefined;' : '',
    slice,
    'export{' + parserName + ' as parse};',
  ].join('\n')
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), DSH_MARKDOWN.tempPrefix))
  fs.copyFileSync(path.join(assets, vendorName), path.join(dir, DSH_MARKDOWN.vendorModule))
  fs.writeFileSync(path.join(dir, DSH_MARKDOWN.indexModule), body)
  const hadDocument = Object.hasOwn(globalThis, 'document')
  const saved = globalThis.document
  // The entity decoder gets an element whose text is the markup it was given (so it decodes nothing); no test text has an entity.
  globalThis.document = { compatMode: DSH_MARKDOWN.compatMode, createElement: () => { let html = ''; return { set innerHTML(v) { html = v }, get textContent() { return html } } } }
  try {
    const mod = await import(pathToFileURL(path.join(dir, DSH_MARKDOWN.indexModule)).href)
    return { parse: mod.parse }
  } finally {
    if (hadDocument) globalThis.document = saved
    else delete globalThis.document
  }
}

/**
 * What the chat would show for one parse: the text inside `strong` nodes, and the text outside them
 * (where a literal `**` means the bold text was not closed and the asterisks are visible).
 */
export function boldSummary(tree) {
  const out = { strong: [], plain: '' }
  const walk = (node, inStrong) => {
    if (node.type === MDAST.text) {
      if (inStrong) out.strong.push(node.value)
      else out.plain += node.value
    }
    for (const child of node.children ?? []) walk(child, inStrong || node.type === MDAST.strong)
  }
  walk(tree, false)
  return out
}
