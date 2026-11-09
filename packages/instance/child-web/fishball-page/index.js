/** Named child-only package boundary; mounted by launch overlay, never the main bundle. */
export const name = 'fishball-page'
export function apply() {
  // PG-1 owns view registration/guards. No session, shortcut or storage policy is implied here.
}
