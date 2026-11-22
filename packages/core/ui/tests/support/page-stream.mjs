/**
 * The Fishball page's one live connection, as fishball-ui's tests observe it (the image-loop fix,
 * 2026-11-22): every live view arrives on ONE EventSource, `api/fishball/page/events?lang=<en|zh>&tz=<IANA zone>`,
 * as default messages `{topic, frame}` whose frame is exactly what the view's old route sent; the
 * connection's health is every view's. The vocabulary is fishball-ui's own (ui-seam SEAM_PAGE_STREAM,
 * ./seam.mjs); the EventSource stand-in is fishball-test-helpers/event-source.
 */
import { SEAM_PAGE_STREAM } from './seam.mjs'

/** The carrier, page-relative and absolute, its query words and the built-in topics. */
export const PAGE_STREAM = Object.freeze({
  relative: SEAM_PAGE_STREAM.route.slice(1),
  path: SEAM_PAGE_STREAM.route,
  param: Object.freeze({ lang: SEAM_PAGE_STREAM.langParameter, tz: SEAM_PAGE_STREAM.zoneParameter }),
  /** fishball-taskboard's topic name (docs/plugins/fishball-taskboard.md), carried beside the built-in two. */
  topic: Object.freeze({ ...SEAM_PAGE_STREAM.topic, taskboard: 'fishball-taskboard' }),
  /** The browser service fishball-ui provides (`{subscribe(topic, {frame, health})}`). */
  client: SEAM_PAGE_STREAM.client,
})

/** The health words the browser service tells a member (R5). */
export const HEALTH = Object.freeze({ live: 'live', stale: 'stale', closed: 'closed' })

/** The stream-health hooks every fishball-ui view draws (R-FIX-FUI F3, the requirement's names). */
export const HEALTH_HOOK = Object.freeze({
  notice: 'data-fishball-stream-notice',
  retry: 'data-fishball-stream-retry',
  asksStale: 'data-fishball-asks-stale',
})
/** The notice words of each health state and the Reconnect label (R-FIX-FUI F3 copy). */
export const NOTICE_TEXT = Object.freeze({
  stale: Object.freeze({ en: 'Reconnecting to Fishball… What is shown here may be out of date.', zh: '正在重新连接 Fishball… 此处显示的内容可能已过时。' }),
  closed: Object.freeze({ en: 'The connection to Fishball was lost. What is shown here may be out of date.', zh: '与 Fishball 的连接已断开。此处显示的内容可能已过时。' }),
  retry: Object.freeze({ en: 'Reconnect', zh: '重新连接' }),
})

/** One wire message of the page connection: a view's own frame under its topic. */
export const pageMessage = (topic, frame) => ({ [SEAM_PAGE_STREAM.field.topic]: topic, [SEAM_PAGE_STREAM.field.frame]: frame })

/** Whether a source is the page connection (its path, whatever its query). */
export const isPageStream = (source, base) => new URL(source.url, base).pathname === PAGE_STREAM.path

/** The browser's IANA zone, as the page sends it in `tz`. */
export const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

/**
 * One view of the page connection: `deliver(frame)` sends the view's frame under its topic;
 * `deliverRaw(text)` puts the text where the frame goes, so text that is not JSON makes the whole
 * message unreadable; `fail`, `url`, `closed` and `readyState` are the one connection's.
 */
export function topicView(source, topic) {
  return {
    source,
    get url() { return source.url },
    get closed() { return source.closed },
    get readyState() { return source.readyState },
    deliver: (frame) => source.deliver(pageMessage(topic, frame)),
    deliverRaw: (text) => source.deliverRaw('{' + JSON.stringify(SEAM_PAGE_STREAM.field.topic) + ':' + JSON.stringify(topic) + ',' + JSON.stringify(SEAM_PAGE_STREAM.field.frame) + ':' + text + '}'),
    fail: (options) => source.fail(options),
  }
}
