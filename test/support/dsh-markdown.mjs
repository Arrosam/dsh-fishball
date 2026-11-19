/**
 * DSH's own markdown parser, run offline in Node (never another markdown library).
 *
 * The chat renders an assistant message with the function `gU`-style renderer of the web frontend bundle: micromark's
 * `fromMarkdown` with the gfm extension, DSH's own attention rule (`cjkFriendlyAttention`) and the math extensions, and a
 * small post-processing step. The bundle is minified, so this module cuts that stretch of source out of the installed
 * bundle verbatim (from the post-processing function to the end of the parser function), writes it beside a copy of the
 * bundle's vendor chunk, and imports it. What is not DSH's code:
 *  - a stub `document` while the vendor chunk loads (KaTeX reads `document.compatMode`; the entity decoder asks for an
 *    element), removed again after the import;
 *  - a stub for the one image-file-type helper the post-processing step calls (`undefined`: the step then leaves the tree
 *    alone; it only rewrites a paragraph that is a single local image path).
 * The mdast -> React step of the chat is not run: a `strong` node is what the chat shows as bold text.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { DSH_MARKDOWN, MDAST } from './constants.mjs'

const assetsOf = (version) => path.join(DSH_MARKDOWN.versionsDir, version, ...DSH_MARKDOWN.assets)

/** The importing clause of the index chunk: `import{...}from"./vendor-xxx.js"`. */
const vendorImport = (source) => /import\{[^}]*\}from"\.\/vendor-[^"]*"/.exec(source)?.[0]

/**
 * Build and import the renderer of one DSH version.
 * @returns {Promise<{parse: (markdown: string) => object} | {skip: string}>} `skip` names why it cannot be built.
 */
export async function loadRenderer(version) {
  const assets = assetsOf(version)
  if (!fs.existsSync(assets)) return { skip: 'DSH ' + version + ' is not installed (no ' + assets + ')' }
  const files = fs.readdirSync(assets)
  const indexName = files.find((f) => DSH_MARKDOWN.indexFile.test(f) && fs.readFileSync(path.join(assets, f), 'utf8').includes(DSH_MARKDOWN.marker))
  const vendorName = files.find((f) => DSH_MARKDOWN.vendorFile.test(f))
  if (!indexName || !vendorName) return { skip: 'DSH ' + version + ': no frontend bundle holds ' + DSH_MARKDOWN.marker }
  const source = fs.readFileSync(path.join(assets, indexName), 'utf8')
  const found = DSH_MARKDOWN.parserPattern.exec(source)
  if (!found) return { skip: 'DSH ' + version + ': the parser function was not found in ' + indexName }
  const [parserText, parserName, postName] = found
  const start = source.indexOf('function ' + postName + '(')
  const imports = vendorImport(source)
  if (start < 0 || start > found.index || !imports) return { skip: 'DSH ' + version + ': the markdown stretch of ' + indexName + ' has an unexpected shape' }
  const slice = source.slice(start, found.index + parserText.length)
  const imageKind = DSH_MARKDOWN.imageKindPattern.exec(slice)?.[1]
  const body = [
    imports.replace(/from"\.\/vendor-[^"]*"/, 'from"./' + DSH_MARKDOWN.vendorModule + '"'),
    imageKind ? 'const ' + imageKind + '=()=>undefined;' : '',
    slice,
    'export{' + parserName + ' as parse};',
  ].join('\n')
  const dir = path.join(DSH_MARKDOWN.generated, version)
  fs.mkdirSync(dir, { recursive: true })
  fs.copyFileSync(path.join(assets, vendorName), path.join(dir, DSH_MARKDOWN.vendorModule))
  fs.writeFileSync(path.join(dir, DSH_MARKDOWN.indexModule), body)
  const hadDocument = Object.hasOwn(globalThis, 'document')
  const saved = globalThis.document
  // The entity decoder gets an element whose text is the markup it was given (so it decodes nothing); no test text has an entity.
  globalThis.document = { compatMode: DSH_MARKDOWN.compatMode, createElement: () => { let html = ''; return { set innerHTML(v) { html = v }, get textContent() { return html } } } }
  try {
    const mod = await import(pathToFileURL(path.join(dir, DSH_MARKDOWN.indexModule)).href)
    return { parse: mod.parse }
  } catch (error) {
    return { skip: 'DSH ' + version + ': the extracted renderer did not load: ' + error.message.slice(0, 200) }
  } finally {
    if (hadDocument) globalThis.document = saved
    else delete globalThis.document
  }
}

/**
 * What the chat would show for one parse: the text inside `strong` nodes, and the text outside them (where a literal
 * `**` means the bold text was not closed and the asterisks are visible).
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
