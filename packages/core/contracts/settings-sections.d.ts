/**
 * `fishballSettingsSections`: the settings-section extension point of core's generic slim settings
 * panel (task K3 freezes it as task R-CORE created it, now core's `client.settings.js` (I-PLACE);
 * R-HOST-11). A browser-side service the panel provides through the client's `reflect`; a plugin
 * injects it and registers once it exists. Types only.
 *
 * The point is generic: it carries no flag, type or member about where the DSH runs, and the panel
 * works unchanged with no section but its own. `HTMLElement` needs the DOM library in the reader's
 * TypeScript settings (`lib: ["dom"]`): the point lives in the browser. Its own sections ("Read Only" at order 100, the
 * native-page links at 200) are registered through it like any other.
 */

/** The service's name, as a plugin injects it. */
export type SettingsSectionsServiceName = 'fishballSettingsSections'

/** A section's accessible name, read at each render so it follows the locale. */
export type SectionTitle = () => string

/**
 * One section.
 * - `id`: a non-empty string, unique among the registered sections;
 * - `title()`: the section's accessible name, read at each render (so it follows the locale);
 * - `order`: a finite number; the panel draws sections by ascending `order`, then by `id`;
 * - `mount(host)`: draws into `host`, an empty element the panel owns and gives only to this
 *   section. The contract names no UI library: a section draws with plain DOM, or with any
 *   library it brings. A throwing `mount` shows the panel's "could not be loaded" line for this
 *   section only;
 * - `unmount(host)`: removes what `mount` drew. Called when the panel closes, and when the
 *   section is withdrawn (its registration disposed, which also happens when the registering
 *   plugin is disposed): **at most once per `mount`**, and never for a `mount` that threw.
 */
export interface SettingsSection {
  readonly id: string
  readonly title: SectionTitle
  readonly order: number
  readonly mount: (host: HTMLElement) => void
  readonly unmount: (host: HTMLElement) => void
}

/** The panel's style class names, so a section looks like the panel without copying its styles. */
export interface SettingsSectionClasses {
  readonly section: string
  readonly row: string
  readonly hint: string
  readonly error: string
}

export interface FishballSettingsSections {
  /**
   * Adds a section and returns the disposer that withdraws it (idempotent). The panel redraws at
   * once. A malformed section throws `TypeError`; an `id` already registered throws `Error`;
   * neither registers anything. A withdrawn section leaves no trace in the panel.
   */
  register(section: SettingsSection): () => void

  /**
   * A convenience pair for a section drawn with the panel's own React: `render` is called inside
   * the panel's tree (through a portal into `host`), so the section keeps the page's React context
   * and re-renders with the panel. Its result is whatever that React accepts as a node; the
   * contract does not type it, so it carries no UI library.
   */
  reactSection(render: () => unknown): Pick<SettingsSection, 'mount' | 'unmount'>

  readonly classes: SettingsSectionClasses
}
