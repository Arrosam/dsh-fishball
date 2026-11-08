/**
 * E1 re-test (card titles) — the Plugins page shows a readable title for each package, in the
 * user's language, instead of the raw package name.
 *
 * Requirements (the user's E1 report and the fix's contract):
 * - DSH titles a package card from `meta.title` of the locale file exported at
 *   `./locale/<lang>.json`; when that file is absent it falls back to the raw package name.
 * - Both packages therefore ship `locale/en.json` and `locale/zh.json` and export that path:
 *   "Fishball connector" / "Fishball instance", Chinese "Fishball 连接器" / "Fishball 实例".
 * - D22: only these two plugins exist; neither card is called "Fishball" alone.
 *
 * Techniques: EP (package × language), DT (export resolves and file is packed, so no fallback),
 * BVA (a title is non-empty and not the package name).
 *
 * | id | technique | expected |
 * |----|-----------|----------|
 * | CT-EP-01/02 | EP (package, en) | "Fishball connector" / "Fishball instance" |
 * | CT-EP-03/04 | EP (package, zh) | "Fishball 连接器" / "Fishball 实例" |
 * | CT-DT-01 | DT (export → file) | the exported `./locale/*.json` resolves to the packed locale file |
 * | CT-DT-02 | DT (packed) | `files` carries `locale/*.json`, so the tarball ships the titles |
 * | CT-BVA-01 | BVA (name) | a title is non-empty, trimmed and not the package name |
 * | CT-EP-05 | EP (language) | en ≠ zh and the zh title carries CJK |
 * | CT-EP-06 | EP (D22) | the two cards are distinct and neither is "Fishball" |
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { BODY_SOUL, CJK } from './support/body-soul-env.mjs'

/** The user-visible card titles the E1 report expects, per package and language. */
const TITLE = Object.freeze({
  connector: { en: 'Fishball connector', zh: 'Fishball 连接器' },
  instance: { en: 'Fishball instance', zh: 'Fishball 实例' },
})
const PACKAGES = Object.freeze({
  connector: { dir: BODY_SOUL.connector, name: 'fishball-connector' },
  instance: { dir: BODY_SOUL.instance, name: 'fishball-instance' },
})
const LANGS = Object.freeze(['en', 'zh'])
const LOCALE_EXPORT = './locale/*.json'

const manifestOf = (pkg) => JSON.parse(fs.readFileSync(path.join(pkg.dir, 'package.json'), 'utf8'))
const titleOf = (pkg, lang) => {
  const file = path.join(pkg.dir, 'locale', lang + '.json')
  const document = JSON.parse(fs.readFileSync(file, 'utf8'))
  return document.meta?.title
}

describe('E1 the Plugins card titles come from the exported locale files', () => {
  for (const [key, pkg] of Object.entries(PACKAGES)) {
    for (const lang of LANGS) {
      const id = 'CT-EP-' + (lang === 'en' ? (key === 'connector' ? '01' : '02') : key === 'connector' ? '03' : '04')
      it(id + ' the ' + key + ' card is titled "' + TITLE[key][lang] + '" in ' + lang, () => {
        assert.equal(titleOf(pkg, lang), TITLE[key][lang])
      })
    }

    it('CT-DT-01 the ' + key + ' manifest exports the locale path DSH reads', () => {
      const manifest = manifestOf(pkg)
      assert.equal(manifest.exports[LOCALE_EXPORT], './locale/*.json')
      for (const lang of LANGS) {
        const relative = manifest.exports[LOCALE_EXPORT].replace('*', lang)
        const resolved = path.join(pkg.dir, relative)
        assert.ok(fs.existsSync(resolved), 'the exported title file exists: ' + relative)
      }
    })

    it('CT-DT-02 the ' + key + ' tarball ships the locale files', () => {
      const manifest = manifestOf(pkg)
      assert.ok(manifest.files.includes('locale/*.json'), 'files carries locale/*.json')
    })

    it('CT-BVA-01 the ' + key + ' titles are non-empty, trimmed and not the package name', () => {
      for (const lang of LANGS) {
        const title = titleOf(pkg, lang)
        assert.ok(typeof title === 'string' && title.length > 0)
        assert.equal(title, title.trim())
        assert.notEqual(title, pkg.name)
      }
    })

    it('CT-EP-05 the ' + key + ' title is localized', () => {
      assert.notEqual(titleOf(pkg, 'en'), titleOf(pkg, 'zh'))
      assert.match(titleOf(pkg, 'zh'), CJK)
    })
  }

  it('CT-EP-06 the two cards are distinct and neither is just "Fishball"', () => {
    for (const lang of LANGS) {
      const connector = titleOf(PACKAGES.connector, lang)
      const instance = titleOf(PACKAGES.instance, lang)
      assert.notEqual(connector, instance)
      for (const title of [connector, instance]) assert.notEqual(title, 'Fishball')
    }
  })
})
