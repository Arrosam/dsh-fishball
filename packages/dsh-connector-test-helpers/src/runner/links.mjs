/**
 * The root node_modules links an `npm install` of the workspaces would make, for a checkout that
 * has not been installed since a workspace was added: each workspace package (product, helpers and
 * integration packages) linked under its npm name. Only a missing link is created; an existing
 * entry is left alone. Nothing is fetched.
 */
import fs from 'node:fs'
import path from 'node:path'
import { REPO } from '../repo.mjs'

/** Every workspace folder of the root manifest; an entry ending in /* names each folder inside it. */
export function workspaceDirs() {
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'))
  const expand = (w) => (w.endsWith('/*')
    ? (fs.existsSync(path.join(REPO, w.slice(0, -2))) ? fs.readdirSync(path.join(REPO, w.slice(0, -2))).map((n) => path.join(REPO, w.slice(0, -2), n)) : [])
    : [path.join(REPO, w)])
  return (manifest.workspaces ?? []).flatMap(expand).filter((dir) => fs.existsSync(path.join(dir, 'package.json')))
}

export function linkWorkspaces() {
  const modules = path.join(REPO, 'node_modules')
  fs.mkdirSync(modules, { recursive: true })
  for (const dir of workspaceDirs()) {
    const { name } = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    const link = path.join(modules, name)
    if (fs.existsSync(link) || isDanglingLink(link)) continue
    fs.mkdirSync(path.dirname(link), { recursive: true })
    fs.symlinkSync(path.relative(path.dirname(link), dir), link)
  }
}

function isDanglingLink(file) {
  try { return fs.lstatSync(file).isSymbolicLink() } catch { return false }
}