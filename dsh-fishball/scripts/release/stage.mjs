/**
 * Staging: a package's shipped files copied into a scratch folder, with real copies of its
 * bundled dependencies in the staged `node_modules/`. npm pack then runs on the stage, never on the
 * checkout, so nothing is written into `packages/*` (Fishball's decision for the user, 2026-11-17:
 * a copy there would shadow the source in dev and test runs) and no symlink can reach a tarball
 * (`npm pack` drops symlinks, so a tracked link would silently vanish from the package).
 */
import fs from 'node:fs'
import path from 'node:path'
import { JUNK, MANIFEST } from './constants.mjs'
import { npm } from './tools.mjs'

const isJunk = (relative) => {
  const parts = relative.split(path.sep)
  return parts.some((part) => JUNK.directories.includes(part)) || JUNK.names.includes(parts.at(-1)) || JUNK.patterns.some((pattern) => pattern.test(parts.at(-1)))
}

/**
 * Copy every regular file of `from` into `to`, dereferencing symlinks (a link's target is copied as
 * a regular file, which is how dsh-instance's client.status.js would ship if it were ever a link
 * again) and leaving out JUNK. Directories are created as found.
 */
export function copyTree(from, to, relative = '') {
  const source = path.join(from, relative)
  const info = fs.statSync(source)
  if (info.isDirectory()) {
    for (const entry of fs.readdirSync(source)) {
      const next = path.join(relative, entry)
      if (!isJunk(next)) copyTree(from, to, next)
    }
    return
  }
  fs.mkdirSync(path.dirname(path.join(to, relative)), { recursive: true })
  fs.copyFileSync(source, path.join(to, relative))
}

/**
 * The files npm would pack from `folder`, as npm itself lists them (`npm pack --dry-run --json`), so
 * the stage holds exactly the package's `files` and nothing a hand-written walk might add.
 */
export function packedFiles(folder, env) {
  const [report] = JSON.parse(npm(['pack', '--dry-run', '--json'], { cwd: folder, env }))
  return report.files.map((file) => file.path)
}

/** Stage `folder` into `stage`: npm's own file list, then the manifest the caller gives. */
export function stagePackage(folder, stage, manifest, env) {
  fs.mkdirSync(stage, { recursive: true })
  for (const file of packedFiles(folder, env)) {
    if (isJunk(file)) continue
    fs.mkdirSync(path.dirname(path.join(stage, file)), { recursive: true })
    fs.copyFileSync(fs.realpathSync(path.join(folder, file)), path.join(stage, file))
  }
  fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')
}

/** Put a real copy of the package at `source` into the stage's `node_modules/<name>`, without junk. */
export function bundleInto(stage, name, source) {
  const target = path.join(stage, 'node_modules', name)
  fs.rmSync(target, { recursive: true, force: true })
  copyTree(source, target)
}

/** The names a staged manifest bundles. */
export const bundledNames = (manifest) => manifest[MANIFEST.bundled] ?? []
