import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
const require = createRequire(import.meta.url);
const factory = require('../src/client-entry.cjs');
const metadata = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
if (metadata.name !== 'dsh-fishball' || typeof factory !== 'function') throw new Error('CLIENT_BUILD_INVALID');
const output = `// Generated from src/client-entry.cjs by scripts/build-client.mjs.\nwindow.__ModuleLoader__.load({id:${JSON.stringify(metadata.name)},factory:${factory.toString()}});\n`;
new Script(output, { filename: 'dsh-fishball/client.js' });
const path = fileURLToPath(new URL('../lib/client.js', import.meta.url));
if (process.argv.includes('--check')) {
  if (readFileSync(path, 'utf8') !== output) throw new Error('CLIENT_BUNDLE_STALE');
} else {
  mkdirSync(new URL('../lib', import.meta.url), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, output, { flag: 'wx' }); renameSync(temporary, path);
}
