/** Named child-only package boundary for the generic slim settings panel; its browser half (client.js) owns the panel and the settings-section extension point. */
export const name = 'fishball-settings'
export function apply() {
  // The server half only names the package so client-modules serves its client.js; the panel
  // calls no route of its own. Hosted-only routes belong to fishball-hosted-settings (R-HOST-11).
}
