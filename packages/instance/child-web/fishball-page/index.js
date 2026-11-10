/** Named child-only package boundary; mounted by launch overlay, never the main bundle. */
export const name = 'fishball-page'
export function apply() {
  // The browser half (client.js) owns the page; this server row only names the package. No
  // session, shortcut or storage policy is implied here.
}
