# Feeding Fishball from your plugin

Fishball is a DSH plugin that keeps one always-on assistant session. Any standard DSH plugin can send it events through one service, `ctx.fishball`. There is no special package format: write an ordinary DSH plugin bundle. A working example is in [examples/fishball-source-example](../examples/fishball-source-example).

## Where your plugin runs

Either way works:
- **For everyone.** Installed and enabled in the profile. Your plugin's code runs for every session; its events reach Fishball while Fishball has your plugin on. DSH plugins start off in Fishball, so the user (or Fishball) turns yours on under "Plugins for Fishball" first. While it is off for Fishball, `publish` answers `disabled` and your code keeps running for the others.
- **Fishball only.** Either installed in DSH but left off in the profile, or installed for Fishball alone ("Install a plugin for Fishball only" on Fishball's settings page, or Fishball's `add_plugin`). Then turned on under "Plugins for Fishball". Your code runs only in Fishball's private tree, and only while Fishball has it on.

Fishball's private tree cannot publish host services: a plugin that provides a service (`ctx.provide`) is turned off there with `leaks-service`. Your plugin's tools follow Fishball's tool rules (hidden tools stay hidden; tools nobody has checked wait for the user's Allow once).

## The service

```ts
interface FishballService {
  /** Effect-scoped: removed when your plugin unloads. Throws FISHBALL_SOURCE_DUPLICATE, FISHBALL_LIMIT, FISHBALL_INVALID, FISHBALL_UNKNOWN_PLUGIN. */
  registerSource(def: {
    id: string             // see Source id below
    title: string          // ≤ 200 bytes (UTF-8)
    description?: string   // ≤ 1,024 bytes (UTF-8)
  }): FishballSource
}
interface FishballSource {
  /** false while Fishball is not running, or has your plugin turned off. */
  readonly enabled: boolean
  /** Call listener each time the source becomes enabled (Fishball starts, or turns your plugin on). */
  onEnabled(listener: () => void): () => void
  publish(event: {
    dedupeKey: string      // required, ≤ 256 bytes; (your source, dedupeKey) is delivered once (see Dedupe)
    title: string          // one line (no line breaks), ≤ 120 characters
    body: string           // text or markdown, ≤ maxMessageBytes (64 KB by default)
    occurredAt?: string    // ISO 8601 with an offset, e.g. 2026-10-24T09:00:00+13:00
  }): Promise<{ intakeId: string | null; status: 'accepted' | 'duplicate' | 'disabled' }>
}
```

- **Inject it.** Register inside `ctx.inject(['fishball'], (ctx) => …)` without a static `inject` entry for `fishball`, so your plugin also loads without Fishball and starts when the service appears (and stops when it goes). If your plugin is useless without Fishball, `export const inject = ['fishball']` is fine.
- **Call it as `ctx.fishball.registerSource(…)`.** Fishball works out who is calling from that context; a detached call (`const { registerSource } = ctx.fishball`) or a call after your plugin unloaded is refused with `FISHBALL_UNKNOWN_PLUGIN`.
- **Fixed sizes.** Three sizes are a fixed part of this contract, not settings the user can change, so you can rely on them: a dedupe key is at most **256 bytes**, a source description at most **1,024 bytes**, and a source title at most **200 bytes** (UTF-8; a longer title or description throws `FISHBALL_INVALID`, a longer dedupe key rejects with it). The other bounds named here (`maxSourcesPerPlugin`, `maxMessageBytes`, `auditEntriesKept`) are the user's limits on Fishball's settings page; the defaults shown are what applies until the user changes them.
- **Source id.** Letters, digits, `.`, `_` and `-`, up to 64 characters, distinct within your plugin row. One bundle may register up to `maxSourcesPerPlugin` sources in total (8 by default), across all its rows.
- **Identity.** Fishball names your source `<bundle>/<row>/<source id>` (the row is your plugin row's id, as a slug), worked out from the plugin that called, never from the event. It stays the same whether your plugin runs for everyone or for Fishball only; two rows of one bundle are separate sources. Plugins run in-process with host authority, so this identifies a well-behaved plugin; it is not a security boundary between plugins.
- **When to publish.** Your plugin may load before Fishball is running. Publish when `source.enabled` is true, and again from `source.onEnabled(…)` (it runs each time the source becomes enabled; an error in it is logged, never fatal).
- **Dedupe.** Use a stable id from your data (a message id, an event id). Publishing the same key again answers `duplicate`, also after a restart. Fishball remembers keys as long as it keeps the queue items (the newest `auditEntriesKept` finished items, 500 by default, plus everything not yet read), so republishing a short recent list is safe, but a source with a long history should keep its own watermark and publish only items newer than what it last sent.
- **Errors.** `publish` rejects with an error whose `code` is one of:
  - `FISHBALL_INVALID` (a field is missing or malformed; the message names it),
  - `FISHBALL_TOO_LARGE` (title or body over its limit),
  - `FISHBALL_QUEUE_FULL` (Fishball's queue is full; try again later),
  - `FISHBALL_SOURCE_DISPOSED` (your plugin unloaded the source).
- **Every event wakes Fishball.** There are no urgency levels. Batch frequent changes into one event (e.g. "3 new mails") rather than one event per item; above the user's hourly wake-up limit, events wait in the queue and arrive together.

## What Fishball sees

Your event arrives as a Fishball notice. The title and body are inside an untrusted block, so Fishball uses them as information and never follows instructions in them. Write the body for a reader: what happened, who or what it concerns, and a link or id Fishball can mention.

## Checking it

- Fishball's Plugins page lists registered sources and whether each is enabled, and the Queue section shows each event's status.
- In a test, mount your plugin in a throwaway DSH home (never your real profile) and publish; the dsh-fishball test suite and its smoke check (`spikes/p8-smoke.mjs`) do this with the example.
- A plugin row no Fishball catalog plugin owns (for example a row a profile patch inserts directly) is always accepted while Fishball runs: it has no Fishball switch.
- In Fishball's private tree, prefer `ctx.inject(['fishball'], …)` over a static `inject: ['fishball']`, so your plugin never waits for the service while Fishball starts.
