/**
 * Requirement 2 tests (client UI side): `packages/dsh-instance/client.status.js`.
 * - Defines both English (`en`) and Chinese (`zh`) strings for `'notice.hosted-record-unreadable'`.
 * - Renders `data-fishball-instance-notice="hosted-record-unreadable"` when the status payload
 *   includes `notice: 'hosted-record-unreadable'`.
 * - Does not render a notice element when `notice` is `null`.
 *
 * Designed strictly from requirements using EP and DT.
 */
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { HARNESS, LOCALE_KEYS, NON_FAILED_STATES, NOTICE, STATES, UI } from './constants.mjs'
import { openStatusPage } from './subject.mjs'

const T = { timeout: HARNESS.testTimeoutMs }

/** Finds the locale dictionary entry that defines `key` across registered namespaces. */
function findDictForKey(registeredDicts, key) {
  for (const [ns, dicts] of registeredDicts.entries()) {
    if (dicts && (key in (dicts.en ?? {}) || key in (dicts.zh ?? {}))) {
      return { ns, dicts }
    }
  }
  return null
}

export function registerUiNoticeCases(sdk) {
  describe(`dsh-instance client.status.js notice strings & rendering (SDK ${sdk})`, () => {
    // ------------------------------------------------------------------ Locale strings (EP)
    test(`EP: client.status.js defines distinct non-empty en and zh strings for "${LOCALE_KEYS.recordUnreadable}"`, T, async (t) => {
      const page = await openStatusPage(t, sdk, {
        state: STATES.ready,
        notice: NOTICE.recordUnreadable,
        lang: 'en',
      })
      assert.ok(
        await page.until(() => page.byAttr(UI.attrNotice, NOTICE.recordUnreadable).length === 1),
        'expected status notice element to render',
      )

      const found = findDictForKey(page.registeredDicts, LOCALE_KEYS.recordUnreadable)
      assert.ok(found, `no registered locale dictionary contains "${LOCALE_KEYS.recordUnreadable}"`)

      const enText = found.dicts.en?.[LOCALE_KEYS.recordUnreadable]
      const zhText = found.dicts.zh?.[LOCALE_KEYS.recordUnreadable]
      assert.equal(typeof enText, 'string', 'en string must be defined')
      assert.equal(typeof zhText, 'string', 'zh string must be defined')
      assert.ok(enText.trim().length > 0, 'en string must be non-empty')
      assert.ok(zhText.trim().length > 0, 'zh string must be non-empty')
      assert.notEqual(enText.trim(), zhText.trim(), 'en and zh strings must be distinct')
      assert.match(enText, UI.latinPattern, `en string should contain English text: ${JSON.stringify(enText)}`)
      assert.match(zhText, UI.cjkPattern, `zh string should contain Chinese characters: ${JSON.stringify(zhText)}`)
      assert.deepEqual(page.missingKeys, [], `unexpected missing locale keys: ${JSON.stringify(page.missingKeys)}`)
      assert.deepEqual(page.world.errors, [], `unexpected console errors: ${JSON.stringify(page.world.errors)}`)
    })

    // ------------------------------------------------------------------ Rendering decision table (DT: notice × lang × state)
    describe('notice rendering decision table (DT)', () => {
      for (const lang of UI.langs) {
        for (const state of NON_FAILED_STATES) {
          test(`DT (${lang} × ${state} × notice="${NOTICE.recordUnreadable}"): renders [${UI.attrNotice}="${NOTICE.recordUnreadable}"] with localized copy`, T, async (t) => {
            const page = await openStatusPage(t, sdk, {
              state,
              notice: NOTICE.recordUnreadable,
              lang,
            })

            const rendered = await page.until(() => {
              const nodes = page.byAttr(UI.attrNotice, NOTICE.recordUnreadable)
              return nodes.length === 1 ? nodes[0] : null
            })
            assert.ok(rendered, `expected [${UI.attrNotice}="${NOTICE.recordUnreadable}"] in lang=${lang}, state=${state}`)

            const found = findDictForKey(page.registeredDicts, LOCALE_KEYS.recordUnreadable)
            assert.ok(found, `missing locale dict for ${LOCALE_KEYS.recordUnreadable}`)
            const expectedText = found.dicts[lang][LOCALE_KEYS.recordUnreadable].trim()
            const actualText = page.text(rendered)
            assert.ok(
              actualText.includes(expectedText),
              `expected rendered notice (${JSON.stringify(actualText)}) to include ${lang} copy (${JSON.stringify(expectedText)})`,
            )
            assert.deepEqual(page.missingKeys, [], `missing locale keys: ${JSON.stringify(page.missingKeys)}`)
            assert.deepEqual(page.world.errors, [], `console errors: ${JSON.stringify(page.world.errors)}`)
          })
        }

        test(`DT (${lang} × notice=null): does NOT render [${UI.attrNotice}]`, T, async (t) => {
          const page = await openStatusPage(t, sdk, {
            state: STATES.ready,
            notice: null,
            lang,
          })
          assert.ok(
            await page.until(() => page.byAttr(UI.attrState, STATES.ready).length === 1),
            'status section did not finish loading',
          )
          assert.deepEqual(page.byAttr(UI.attrNotice), [], 'no notice element should render when notice is null')
          assert.deepEqual(page.missingKeys, [])
          assert.deepEqual(page.world.errors, [])
        })

        test(`DT (${lang} × notice="${NOTICE.entryDeleted}"): renders existing entry-deleted notice distinctly`, T, async (t) => {
          const page = await openStatusPage(t, sdk, {
            state: STATES.ready,
            notice: NOTICE.entryDeleted,
            lang,
          })
          const rendered = await page.until(() => {
            const nodes = page.byAttr(UI.attrNotice, NOTICE.entryDeleted)
            return nodes.length === 1 ? nodes[0] : null
          })
          assert.ok(rendered, `expected [${UI.attrNotice}="${NOTICE.entryDeleted}"]`)
          assert.equal(page.byAttr(UI.attrNotice, NOTICE.recordUnreadable).length, 0)
          const found = findDictForKey(page.registeredDicts, LOCALE_KEYS.recordUnreadable)
          assert.notEqual(
            page.text(rendered),
            found.dicts[lang][LOCALE_KEYS.recordUnreadable].trim(),
            'hosted-entry-deleted must not reuse hosted-record-unreadable copy',
          )
          assert.deepEqual(page.missingKeys, [])
          assert.deepEqual(page.world.errors, [])
        })
      }
    })
  })
}
