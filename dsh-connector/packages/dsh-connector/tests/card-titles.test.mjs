import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const CARD = {
  packageName: 'dsh-agent-connector',
  localeExport: './locale/*.json',
  titles: { en: 'Fishball connector', zh: 'Fishball 连接器' },
}

// Restores the package-local contract from 44ceca7. DSH reads metadata without loading the plugin,
// so these cases need neither the SDK matrix nor a running profile.
const readJson = (url) => JSON.parse(readFileSync(new URL(url), 'utf8'))
const readTitle = (locale) => readJson(import.meta.resolve(`${CARD.packageName}/locale/${locale}.json`)).meta?.title

for (const [locale, expected] of Object.entries(CARD.titles)) {
  test(`CT-EP-01 ${locale}: the Plugins card has the approved title`, () => {
    // The distinct, exact strings also rule out both an empty/padded title and a fallback.
    assert.equal(readTitle(locale), expected)
  })
}

test('CT-DT-01 the package manifest exports the locale JSON', () => {
  const manifest = readJson(import.meta.resolve(`${CARD.packageName}/package.json`))
  assert.equal(manifest.exports?.[CARD.localeExport], CARD.localeExport)
})

test('CT-DT-02 the package manifest includes the locale JSON in its published files', () => {
  const manifest = readJson(import.meta.resolve(`${CARD.packageName}/package.json`))
  assert.ok(manifest.files?.includes(CARD.localeExport.slice(2)), 'locale JSON is absent from the files allowlist')
})
