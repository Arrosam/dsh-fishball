/**
 * The contrast rows' drawn documents: fishball-ui's real client alone in the scripted DSH page
 * (../support/ui-page.mjs), its ask card dock fed one `asks` frame (../support/ask-card.mjs), or its
 * sidebar target list (../support/b-sidebar.mjs); the rendered tree and the style sheets the page
 * mounted and still holds (`world.page.styleTexts()`), written into a DSH document
 * (../support/contrast.mjs `themedDocument`: DSH's page styles, its theme, then Fishball's sheets)
 * that a real headless Chromium lays out and styles. Chromium resolves `var(--dsw-…)`,
 * `color-mix()`, the cascade and `::placeholder` as DSH's page does, so the rows measure what a user
 * sees and need no CSS evaluator.
 */
import assert from 'node:assert/strict'
import { findAll } from 'fishball-test-helpers/react-shim'
import { STAND_IN } from 'fishball-test-helpers/dsh-primitives'
import { askCard, askFrame } from '../support/ask-card.mjs'
import { sidebarPage } from '../support/b-sidebar.mjs'
import { FIXTURE, SEAM_TARGETS, frameOf, targetView } from '../support/b-targets.mjs'
import { PROBE, dshSheetCount, measure, themedDocument } from '../support/contrast.mjs'
import { PAGE_STREAM } from '../support/page-stream.mjs'
import { uiPage } from '../support/ui-page.mjs'
import { ASK_BADGE, CARD_VARIANT, HOOK, NOT_LITERAL } from './constants.mjs'

const DOCK = Object.freeze({ slot: 'conversation.input.dock', key: 'fbtest-ask-dock-' })
const json = (v) => JSON.stringify(v)
export const isTag = (n) => n.props?.[STAND_IN.primitive] === HOOK.tagPrimitive

/** One open card of `variant` in Fishball's conversation dock, drawn in `lang`: its tree and live sheets. */
export async function askDocument(t, variant, lang, state) {
  const p = await uiPage(t, { lang })
  await p.mountAll(DOCK.key, DOCK.slot, { sessionId: FIXTURE.managerSession })
  await p.deliver(PAGE_STREAM.topic.asks, askFrame([askCard({ ...CARD_VARIANT[variant], ...(state ? { state } : {}) })], FIXTURE.managerSession))
  return { tree: p.world.shim.tree(), sheets: p.world.page.styleTexts() }
}

/**
 * MULTI-3: the sidebar target list on Fishball's page (requirement G: DSH tokens only, light and
 * dark), one target per public state, the first expanded: its tree and live sheets.
 */
export async function sidebarDocument(t, lang) {
  const p = await sidebarPage(t, { lang })
  const states = Object.values(SEAM_TARGETS.state)
  const frame = await frameOf(states.map((state, i) => targetView(i, { state })), lang)
  await p.deliver(frame)
  await p.toggle(frame.targets[0].name)
  assert.equal(p.rows().length, states.length, 'precondition: one row per state')
  return { tree: p.tree(), sheets: p.world.page.styleTexts() }
}

/** A copy of `nodes` with `attr` added to every element `pick` accepts (the written HTML's handle). */
const marked = (nodes, pick, attr) => nodes.map((n) => (typeof n === 'string' ? n
  : { ...n, props: pick(n) ? { ...n.props, [attr]: '' } : n.props, children: marked(n.children ?? [], pick, attr) }))
/** DSH Tags of `tones` drawn straight in the page body, outside every card: DSH's own Tag look. */
const referenceTags = (tones) => tones.map((tone) => ({ tag: 'span', props: { [STAND_IN.primitive]: HOOK.tagPrimitive, 'data-tone': tone, [ASK_BADGE.reference]: tone }, children: [ASK_BADGE.referenceText] }))
export const BADGE_TARGET = `${HOOK.askCard} [${ASK_BADGE.marker}]`
export const referenceTarget = (tone) => `[${ASK_BADGE.reference}="${tone}"]`

/**
 * One card of `variant` in `state`, drawn in `lang`, its state badge marked (the first DSH Tag inside
 * the card root: DSH's Tag forwards no hook of its own), with reference warning and neutral Tags
 * beside the card. Returns the drawn document and the badge's rendered node.
 */
export async function badgeDocument(t, variant, lang, state) {
  const { tree, sheets } = await askDocument(t, variant, lang, state)
  const card = findAll(tree, (n) => n.props?.[ASK_BADGE.cardAttr] !== undefined)[0]
  assert.ok(card, 'precondition: the dock draws an ask card')
  const badge = findAll([card], isTag)[0]
  assert.ok(badge, 'precondition: the ask card draws a DSH Tag (its state badge)')
  const tags = referenceTags([ASK_BADGE.openTone, ASK_BADGE.settledTone])
  return { drawn: { tree: [...marked(tree, (n) => n === badge, ASK_BADGE.marker), ...tags], sheets }, badge }
}

/** Write the document for `theme` and probe `arg` in Chromium. */
export async function probed(drawn, theme, arg) {
  const html = themedDocument({ ...drawn, theme })
  const result = await measure(html, PROBE, { ownSheetsFrom: dshSheetCount(), notLiteral: NOT_LITERAL, ...arg })
  assert.equal(result.missing, undefined, `no element ${json(result.missing)} in the drawn card`)
  return result
}
