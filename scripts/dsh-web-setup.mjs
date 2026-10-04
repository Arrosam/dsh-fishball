import { mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

if (process.version !== 'v22.22.2') throw new Error('RUNTIME_UNSUPPORTED');
const root = fileURLToPath(new URL('../', import.meta.url));
const runtime = `${root}.runtime/dsh-web`;
const npmRoot = `${root}.runtime/npm-metadata`;
mkdirSync(runtime, { recursive: true });
mkdirSync(`${npmRoot}/cache`, { recursive: true });
for (const name of ['user', 'global']) writeFileSync(`${npmRoot}/${name}.npmrc`, 'registry=https://registry.npmjs.org/\n', { mode: 0o600 });
copyFileSync(new URL('./dsh-web-runtime-package.json', import.meta.url), `${runtime}/package.json`);
copyFileSync(new URL('./dsh-web-runtime-lock.json', import.meta.url), `${runtime}/package-lock.json`);
// Explicit setup is the sole downloader. Launch and tests never install code.
const result = spawnSync('/opt/homebrew/bin/npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund',
  `--userconfig=${npmRoot}/user.npmrc`, `--globalconfig=${npmRoot}/global.npmrc`, `--cache=${npmRoot}/cache`,
  '--fetch-retries=0', '--fetch-timeout=15000'], {
  cwd: runtime, env: { PATH: '/opt/homebrew/bin:/usr/bin:/bin' }, stdio: 'inherit',
});
process.exitCode = result.status ?? 1;
