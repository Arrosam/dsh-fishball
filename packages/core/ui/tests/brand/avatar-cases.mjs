/**
 * GENTLE-TOOLS avatar rows (README.md "BRAND-AVATAR"): on the Fishball page, each Fishball reply row's
 * ::before draws an avatar as a CSS mask; its theme follows core's brandStyle setting (configForms
 * 'fishball-core'): the Fishball fish with its #EC0A6E eye, or DSH's own mark (the primitives'
 * FISH_LOGO_PATH) exactly as before. Expectations are the lead's relayed requirement A and its
 * refinement (2026-11-21); fishball-page's client is not read.
 *
 * Techniques: EP (stored brandStyle: fishball / deepseek / absent / other case / unknown / non-string),
 * state transitions (a live form change, both directions, no reload; teardown), and "nothing else
 * changes" rows (the name label, the rows the rules must not reach). The drawing is measured in a
 * headless Chromium (skipped where none exists, as the contrast and motion rows are); the theme
 * attribute rows need no browser.
 *
 * Review fix (the user, 2026-11-21): the <html> theme attribute is data-fishball-page-brand (renamed from
 * data-fishball-brand, which core's settings section uses as its own hook); AVATAR-EP-04 pins that the
 * page leaves that hook alone.
 */
import assert from 'node:assert/strict'
import { AVATAR, THEME } from '../support/brand.mjs'
import { avatarPage } from './avatar.mjs'
import { hasChrome } from './motion.mjs'

const show = (v) => JSON.stringify(v)
const colourOf = (m, token) => m.tokens[token]

/** The Fishball theme's drawing on the reply row. */
function assertFish(m, why) {
  const b = m.reply.before
  assert.ok(b.maskSvg, why + ': no data: SVG mask on ::before: ' + show(b.mask))
  assert.ok(b.maskSvg.includes(AVATAR.fish.body), why + ': the mask is not the fish body: ' + b.maskSvg)
  assert.ok(b.maskSvg.includes(AVATAR.fish.viewBox), why + ': the fish mask is not in viewBox 0 0 24 24: ' + b.maskSvg)
  assert.ok(b.backgroundSvg, why + ': no data: SVG background-image (the eye layer): ' + show(b.backgroundImage))
  assert.ok(b.backgroundSvg.includes(AVATAR.fish.eye), why + ': the background-image has no eye path: ' + b.backgroundSvg)
  assert.ok(AVATAR.fish.eyeFill.test(b.backgroundSvg), why + ': the eye is not filled #EC0A6E: ' + b.backgroundSvg)
  assert.equal(b.backgroundColor, colourOf(m, AVATAR.labelToken), why + ': the fish body is not painted in ' + AVATAR.labelToken)
}
/** The DeepSeek theme's drawing: DSH's mark, as before; no Fishball eye. */
function assertDsh(m, why) {
  const b = m.reply.before
  assert.ok(b.maskSvg, why + ': no data: SVG mask on ::before: ' + show(b.mask))
  assert.ok(b.maskSvg.includes(AVATAR.dshPath), why + ': the mask is not FISH_LOGO_PATH: ' + b.maskSvg)
  assert.equal(b.maskSvg.includes(AVATAR.fish.body), false, why + ': the DeepSeek mask is the fish')
  assert.equal(b.backgroundImage, 'none', why + ': a background-image layer (the Fishball eye) in the DeepSeek theme: ' + b.backgroundImage)
  assert.equal(b.backgroundColor, colourOf(m, AVATAR.businessToken), why + ': not painted in ' + AVATAR.businessToken)
}
const assertTheme = (m, theme, why) => (theme === THEME.deepseek ? assertDsh(m, why) : assertFish(m, why))

/** Registers the avatar rows on the brand suite's registrar 't'. */
export function registerAvatar(t) {
  const browserRow = (id, row, title, fn) => t(id, row, title, async (c) => {
    if (!hasChrome()) { c.skip('no Chromium binary (the contrast rows skip so too)'); return }
    await fn(c)
  })

  // ------------------------------------------------------------------ EP: the stored theme -> the attribute (no browser)
  const partitions = [
    ['absent', AVATAR.absent, THEME.fishball],
    ['fishball', THEME.fishball, THEME.fishball],
    ['deepseek', THEME.deepseek, THEME.deepseek],
    ...AVATAR.readAsFishball.map(([label, value]) => [label, value, THEME.fishball]),
  ]
  for (const [label, style, theme] of partitions) {
    t('AVATAR-EP-01', label, 'stored brandStyle ' + label + ' -> <html data-fishball-page-brand="' + theme + '"> while the page is mounted', async (c) => {
      const p = await avatarPage(c, { style })
      assert.equal(p.page.html.hasAttribute(AVATAR.pageAttr), true, 'precondition: the page root mark')
      assert.equal(p.brand(), theme)
    })
  }
  t('AVATAR-EP-01', 'no value yet', 'a served form whose value is still undefined reads as the default fishball', async (c) => {
    const p = await avatarPage(c, { value: false })
    assert.equal(p.brand(), THEME.fishball)
  })

  // ------------------------------------------------------------------ EP: the drawing per theme (browser)
  for (const [label, style, theme] of [['absent', AVATAR.absent, THEME.fishball], ['fishball', THEME.fishball, THEME.fishball], ['deepseek', THEME.deepseek, THEME.deepseek], ['other case', 'DeepSeek', THEME.fishball], ['non-string', 7, THEME.fishball]]) {
    browserRow('AVATAR-EP-02', label, 'stored brandStyle ' + label + ': the reply avatar is the ' + theme + ' drawing (' + (theme === THEME.fishball ? 'fish body mask in the label colour, #EC0A6E eye layer' : "DSH's FISH_LOGO_PATH mask in the business colour, no eye layer") + ')', async (c) => {
      const p = await avatarPage(c, { style })
      assertTheme(await p.measure(), theme, label)
    })
  }

  // ------------------------------------------------------------------ nothing else changes (browser)
  browserRow('AVATAR-EP-03', 'unchanged', 'in both themes the name label ::after stays "Fishball" with the same box, the row box is the same, and rows that are not Fishball replies in main.conversation get no avatar', async (c) => {
    const seen = {}
    for (const theme of [THEME.fishball, THEME.deepseek]) {
      const p = await avatarPage(c, { style: theme })
      const m = await p.measure()
      assert.equal(m.reply.after.content, '"' + AVATAR.name + '"', theme + ': the name label')
      // MSG-USER: the expanded assistant reply is no longer a Fishball message; rows outside main.conversation never were.
      for (const role of ['expanded', 'other-part', 'outside', 'plain']) {
        assert.equal(m[role].before.mask, 'none', theme + ': ' + role + ' row has an avatar mask')
        assert.equal(m[role].after.content, 'none', theme + ': ' + role + ' row has the name label')
      }
      seen[theme] = { after: m.reply.after, row: m.reply.row, box: m.reply.before.box }
    }
    assert.deepEqual(seen[THEME.deepseek], seen[THEME.fishball], 'the theme changed more than the avatar drawing')
  })

  // ------------------------------------------------------------------ MSG-USER: the look moved to the message row (browser)
  // The lead (2026-11-21): the avatar, label and bubble belong to [data-chat-flow-kind="fishball-message"];
  // expanded hidden replies get a plain look so they do not read as messages to the user. 'plain' is the
  // same assistant reply outside main.conversation, which no Fishball rule reaches: DSH's own look.
  browserRow('AVATAR-EP-05', 'expanded reply plain', 'in both themes an expanded assistant-step reply has no avatar, no "Fishball" label and no bubble (its content box is the unstyled one), while the message row has a bubble', async (c) => {
    for (const theme of [THEME.fishball, THEME.deepseek]) {
      const p = await avatarPage(c, { style: theme })
      const m = await p.measure()
      assert.equal(m.expanded.before.mask, 'none', theme + ': the expanded reply has an avatar mask')
      assert.equal(m.expanded.before.backgroundImage, 'none', theme + ': the expanded reply has an avatar layer')
      assert.ok(['none', 'normal'].includes(m.expanded.before.content), theme + ': the expanded reply draws a ::before: ' + m.expanded.before.content)
      assert.ok(['none', 'normal'].includes(m.expanded.after.content), theme + ': the expanded reply has the name label: ' + m.expanded.after.content)
      assert.deepEqual(m.expanded.bubble, m.plain.bubble, theme + ': the expanded reply\'s content is styled as a bubble')
      assert.equal(m.expanded.row, m.plain.row, theme + ': the expanded reply\'s row box was changed')
      assert.notDeepEqual(m.reply.bubble, m.plain.bubble, theme + ': the message row has no bubble look: ' + show(m.reply.bubble))
    }
  })

  // ------------------------------------------------------------------ state transitions: a live change of the setting
  for (const [from, to] of [[THEME.fishball, THEME.deepseek], [THEME.deepseek, THEME.fishball]]) {
    t('AVATAR-ST-01', from + ' -> ' + to, 'a form notification ' + from + ' -> ' + to + ' -> ' + from + ' flips <html data-fishball-page-brand> live, without reinstalling the page', async (c) => {
      const p = await avatarPage(c, { style: from })
      const registrations = p.page.log.registrations.length
      assert.equal(p.brand(), from)
      await p.restyle(to)
      assert.equal(p.brand(), to, 'no live change')
      await p.restyle(from)
      assert.equal(p.brand(), from, 'no live change back')
      assert.equal(p.page.log.registrations.length, registrations, 'the page registered its slots again (a reload)')
    })
    browserRow('AVATAR-ST-02', from + ' -> ' + to, 'the drawn avatar follows a live change ' + from + ' -> ' + to + ' -> ' + from + ', with no reload', async (c) => {
      const p = await avatarPage(c, { style: from })
      assertTheme(await p.measure(), from, 'at start')
      await p.restyle(to)
      assertTheme(await p.measure(), to, 'after the change')
      await p.restyle(from)
      assertTheme(await p.measure(), from, 'after the change back')
    })
  }
  t('AVATAR-ST-01', 'deepseek -> unknown', 'a live change from deepseek to an unknown value reads as fishball', async (c) => {
    const p = await avatarPage(c, { style: THEME.deepseek })
    await p.restyle('orca')
    assert.equal(p.brand(), THEME.fishball)
  })

  // ------------------------------------------------------------------ EP: core's settings hook is not the page's (review fix)
  for (const theme of [THEME.fishball, THEME.deepseek]) {
    t('AVATAR-EP-04', 'settings hook ' + theme, 'with a settings-section-like [data-fishball-brand] element in the same document (stored ' + theme + ', a live change and back, then teardown): <html> carries data-fishball-page-brand and never data-fishball-brand, and the section keeps its hook value untouched', async (c) => {
      const other = theme === THEME.deepseek ? THEME.fishball : THEME.deepseek
      const p = await avatarPage(c, { style: theme, section: true })
      const hook = () => p.section.element.getAttribute(AVATAR.settingsHook)
      const assertUntouched = (why) => {
        assert.equal(p.page.html.hasAttribute(AVATAR.settingsHook), false, why + ': <html> carries ' + AVATAR.settingsHook)
        assert.equal(p.htmlWrites().includes(AVATAR.settingsHook), false, why + ': the page wrote ' + AVATAR.settingsHook + ' on <html>: ' + show(p.htmlWrites()))
        assert.equal(hook(), AVATAR.settingsSection.value, why + ': the section hook changed')
        assert.deepEqual([...p.section.writes], [], why + ': the page wrote on the settings section: ' + show([...p.section.writes]))
      }
      assert.equal(p.brand(), theme, 'the page theme attribute')
      assertUntouched('mounted')
      await p.restyle(other)
      assert.equal(p.brand(), other, 'no live change')
      assertUntouched('after a live change')
      await p.restyle(theme)
      await p.page.unmount()
      assert.equal(p.page.html.hasAttribute(AVATAR.brandAttr), false, 'the theme attribute stayed after teardown')
      assertUntouched('after teardown')
    })
  }

  // ------------------------------------------------------------------ teardown
  t('AVATAR-ST-03', 'teardown', 'unmounting the page removes <html data-fishball-page-brand>, stops following the form (no listener left), and a later change writes nothing', async (c) => {
    const p = await avatarPage(c, { style: THEME.deepseek })
    assert.equal(p.brand(), THEME.deepseek, 'precondition')
    await p.page.unmount()
    assert.equal(p.page.html.hasAttribute(AVATAR.brandAttr), false, 'the theme attribute stayed after teardown')
    assert.equal(p.form.listeners, 0, 'a form subscription left after teardown')
    await p.restyle(THEME.fishball)
    assert.equal(p.page.html.hasAttribute(AVATAR.brandAttr), false, 'written after teardown')
  })
}