/**
 * The two packages these rows integrate, found BY NAME (fishball-test-helpers/packages' catalogue):
 * fishball-core (the bundle whose patch carries fishball-ui's rows) and fishball-ui (core's ./ui/
 * component, its own package and manifest), plus their library fishball-shared. A file of a package is
 * named by its package-relative path, never by a repository path string.
 */
import fs from 'node:fs'
import path from 'node:path'
import { packageByName } from 'fishball-test-helpers/packages'

export const NAME = Object.freeze({ core: 'fishball-core', ui: 'fishball-ui', shared: 'fishball-shared' })
export const dirOf = (name) => fs.realpathSync(packageByName(name).abs)
export const fileOf = (name, ...parts) => path.join(dirOf(name), ...parts)
export const manifestOf = (name, ...parts) => {
  const file = fileOf(name, ...parts, 'package.json')
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null
}
