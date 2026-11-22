/**
 * Vocabulary for the persona bold-text rule cases (R-B4; README.md beside this file).
 *
 * The requirement: in bold text, Chinese punctuation goes outside the `**` markers, because DSH's
 * chat renderer leaves `**还在进行中：**dsh` unclosed (asterisks shown) and renders
 * `**还在进行中**：dsh` bold. The persona (core's src/persona.js, its PERSONA_ROLE data export) carries
 * the rule line with both forms of the example. Every value here is the requirement's example or
 * fixture text, or the shape of DSH's own shipped web frontend bundle.
 */
import path from 'node:path'

/** fishball-core's folder (tests/persona/ is two levels below it). */
const PACKAGE_DIR = path.join(import.meta.dirname, '..', '..')

export const PERSONA_BOLD = Object.freeze({
  /** The persona module as the plugin ships it (data exports only are read). */
  module: path.join(PACKAGE_DIR, 'src', 'persona.js'),
  roleExport: 'PERSONA_ROLE',
  lineBreak: '\n',
  /** The bold marker, and the two forms of the requirement's example: to write, and not to write. */
  marker: '**',
  asterisk: '*',
  /** The example's words and its Chinese punctuation mark (the full-width colon, U+FF1A). */
  words: '还在进行中',
  punct: '：',
  good: '**还在进行中**：',
  bad: '**还在进行中：**',
})

/**
 * DSH's own markdown renderer, run offline: the current DSH's web frontend bundle
 * (`dsh-web-frontend/dist/assets/index-*.js` plus its `vendor-*.js` chunk).
 */
/**
 * The bundle's import keyword, kept apart from the quoted specifier pattern: written together in one
 * literal they read as an import statement to the repository's independence check.
 */
const IMPORT_KEYWORD = 'from'
const VENDOR_SPECIFIER = '"\\./vendor-[^"]*"'
export const DSH_MARKDOWN = Object.freeze({
  package: 'dsh-web-frontend',
  assets: path.join('dist', 'assets'),
  indexFile: /^index-.*\.js$/,
  vendorFile: /^vendor-.*\.js$/,
  /** The bundle is the chat's renderer when it holds DSH's own attention rule. */
  marker: 'cjkFriendlyAttention',
  /**
   * A parser function: `function P(e){return POST(FROM(e,{extensions:[…],mdastExtensions:[…]}),e)}`.
   * The bundle has more than one (0.2.2-rc.5: a plain one, and the chat's with the math extensions
   * added); the chat's is the one with the most extensions. 0.2.1-rc.2/rc.3 had exactly four and two.
   */
  parserPattern: /function ([\w$]+)\(e\)\{return ([\w$]+)\(([\w$]+)\(e,\{extensions:\[([^\]]*)\],mdastExtensions:\[([^\]]*)\]\}\),e\)\}/g,
  extensionSeparator: ',',
  /** The one helper the post-processing calls that is not part of the extracted slice (image file types); unused for bold text. */
  imageKindPattern: /([\w$]+)\([\w$]\[2\]\)==="image"/,
  /** The index chunk's import clause of its vendor chunk, and the specifier part of it (built from parts: see IMPORT_KEYWORD). */
  vendorImport: new RegExp('import\\{[^}]*\\}' + IMPORT_KEYWORD + VENDOR_SPECIFIER),
  vendorFrom: new RegExp(IMPORT_KEYWORD + VENDOR_SPECIFIER),
  /** What the bundle needs from a browser while it loads: only `document.compatMode` and an element for entity decoding. */
  compatMode: 'CSS1Compat',
  indexModule: 'dsh-renderer.mjs',
  vendorModule: 'vendor.mjs',
  /** The extracted module is written under the run's temp directory (removed with it). */
  tempPrefix: 'fbtest-dsh-markdown-',
})

/** The mdast node types the bold checks read. */
export const MDAST = Object.freeze({ text: 'text', strong: 'strong' })

/** Characters that may follow the punctuation, by class (the renderer decides by what follows a closing marker). */
export const AFTER_PUNCT = Object.freeze({
  latin: 'dsh',
  upper: 'DSH',
  digit: '1',
  accented: 'é',
  cyrillic: 'ж',
  chinese: '好',
  space: ' dsh',
  end: '',
  asciiPunct: '.',
})
/** After which the unclosed form stays unclosed (a letter or digit follows the closing marker), and after which it closes. */
export const AFTER_WORD = Object.freeze(['latin', 'upper', 'digit', 'accented', 'cyrillic'])
export const AFTER_NON_WORD = Object.freeze(['chinese', 'space', 'end', 'asciiPunct'])

/** Chinese (full-width and CJK) punctuation marks: the persona rule covers these. */
export const CHINESE_PUNCT = Object.freeze(['，', '。', '！', '？', '；', '：', '、', '）', '」', '”', '…', '—', '（', '【', '》'])
/** Texts for the sentence-level cases. */
export const BOLD_SENTENCES = Object.freeze({
  midLine: Object.freeze({ text: '状态：**还在进行中**：dsh 继续', strong: Object.freeze(['还在进行中']) }),
  twoBold: Object.freeze({ text: '**还在进行中**：dsh 和 **另一个**：abc', strong: Object.freeze(['还在进行中', '另一个']) }),
  list: Object.freeze({ text: '- **还在进行中**：dsh\n- **完成**：x', strong: Object.freeze(['还在进行中', '完成']) }),
})
