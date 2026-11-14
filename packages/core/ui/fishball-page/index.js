/** Named package boundary of the Fishball page; core's patch mounts it (I-PLACE), never another DSH's bundle. */
export const name = 'fishball-page'
export function apply() {
  // The browser half (client.js) owns the page; this server row only names the package. No
  // session, shortcut or storage policy is implied here.
}
