import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// No build, package install, network lookup or downloaded executable.
let count = 0;
for (const directory of ['src', 'scripts', 'test']) {
  for (const name of readdirSync(directory).filter(name => name.endsWith('.mjs')).sort()) {
    const result = spawnSync(process.execPath, ['--check', join(directory, name)], { encoding: 'utf8' });
    if (result.status !== 0) {
      process.stderr.write(result.stderr);
      process.exit(result.status ?? 1);
    }
    count++;
  }
}
console.log(`Syntax checked ${count} ESM files.`);
