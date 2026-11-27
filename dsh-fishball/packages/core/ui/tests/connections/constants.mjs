/**
 * fishball-ui.connections vocabulary: the Fishball page's ONE live connection (the image-loop fix,
 * requirements R1–R8 relayed by the implementer "image-loop", 2026-11-22; the user's decision of
 * 2026-11-21: every Fishball page data stream on one connection, a CONSTANT count). Every value is
 * the requirement's (ui-seam SEAM_PAGE_STREAM, ../support/seam.mjs) or test data.
 */
import { HEALTH, HEALTH_HOOK, PAGE_STREAM } from '../support/page-stream.mjs'
import { SEAM_PAGE_STREAM } from '../support/seam.mjs'

/** R1: the carrier, and the per-view routes the Fishball page must no longer open. */
export const CARRIER = Object.freeze({
  relative: PAGE_STREAM.relative,
  path: PAGE_STREAM.path,
  langParam: PAGE_STREAM.param.lang,
  tzParam: PAGE_STREAM.param.tz,
  langs: Object.freeze(['en', 'zh']),
  retired: Object.freeze(['/api/fishball/strip', '/api/fishball/asks/events', '/api/fishball-taskboard/events']),
})

/** R2: the constant count of Fishball EventSources with any reader mounted, and the topic counts tried. */
export const COUNT = Object.freeze({
  fishball: SEAM_PAGE_STREAM.perPage,
  /** Amenity topic counts that must all give the same count (boundary 0, 1, many, and far past the old budget). */
  topics: Object.freeze([0, 1, 5, 20]),
  manyTopics: 20,
})

/** R5: the browser service, its health words and the Reconnect hook. */
export const CLIENT = Object.freeze({ service: PAGE_STREAM.client, health: HEALTH, retry: HEALTH_HOOK.retry })

/** R8: the withdrawn budget warning's words (the prefix the earlier fix logged); nothing may log it. */
export const NO_WARNING = Object.freeze({ prefix: 'fishball-ui: more live streams open than its connection budget allows', word: /connection budget/i })

/** The readers fishball-ui draws on the Fishball page (each as DSH renders it). */
export const READERS = Object.freeze(['brand', 'sidebar', 'dock'])
export const SLOT = Object.freeze({ sidebar: 'sidebar.workspaces', dock: 'conversation.input.dock' })
/** The sidebar's owner props (dsh-client-ui-sidebar SidebarWorkspacesOwnerProps: wide, expandSidebar). */
export const SIDEBAR_OWNER = Object.freeze({ wide: true })

/** Test data of the component rows. */
export const FIXTURE = Object.freeze({
  managerSession: 'fbtest-fishball',
  mountKey: 'fbtest-conn-',
  topic: (i) => 'fbtest-topic-' + i,
  frame: (i, n = 0) => ({ fbtest: i, n }),
})
