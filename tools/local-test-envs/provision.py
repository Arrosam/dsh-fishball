"""Prepare a test-only parent profile and disposable Fishball source copies."""
from pathlib import Path
import json
import os
import shutil
import subprocess

from model import provider_patch, seed_credentials

GIT = '/usr/bin/git'
PLUGIN_PATHS = {
    'connector': 'dsh-connector/packages/dsh-connector',
    'instance': 'dsh-fishball-instance/packages/dsh-instance',
}
FISHBALL = 'dsh-fishball'
AMENITIES = 'amenities'
BASE_BUNDLES = ('@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app')
PLUGIN_NAMES = {'connector': 'dsh-agent-connector', 'instance': 'dsh-instance'}
COPY_DIRS = (FISHBALL, AMENITIES, 'dsh-connector', 'dsh-fishball-instance')


def git(root, *args):
    return subprocess.check_output([GIT, '-C', str(root), *args], text=True, stderr=subprocess.DEVNULL,
                                   env={'PATH': '/usr/bin:/bin', 'GIT_CONFIG_NOSYSTEM': '1',
                                        'GIT_CONFIG_GLOBAL': '/dev/null', 'GIT_OPTIONAL_LOCKS': '0'})


def plan_source(source, staging, live=False):
    path = Path(source)
    if not path.is_absolute():
        raise ValueError('Source must be an absolute Git checkout root')
    path = path.resolve(strict=True)
    if (Path(git(path, 'rev-parse', '--show-toplevel').strip()) != path or
            git(path, 'rev-parse', '--path-format=absolute', '--git-common-dir').strip() != str(staging / '.git')):
        raise ValueError('Source must be a registered Fishball checkout root')
    if live and (path != staging or git(path, 'symbolic-ref', '--short', 'HEAD').strip() != 'staging'):
        raise ValueError('Integration must use the main staging checkout')
    roots = {key: path / subdir for key, subdir in PLUGIN_PATHS.items()}
    fishball = path / FISHBALL
    if not all((p / 'package.json').is_file() for p in [*roots.values(), fishball, path / AMENITIES / 'fishball-amenities']):
        raise ValueError('Source must have the post-cutover monorepo layout')
    return {'layout': 'monorepo', 'source': str(path), 'head': git(path, 'rev-parse', 'HEAD').strip(),
            'fishball': str(fishball), **{key: str(p) for key, p in roots.items()},
            'amenities': {p.name: str(p) for p in sorted((path / AMENITIES).iterdir())
                          if (p / 'package.json').is_file()}}


def snapshot(plan, destination, staging):
    source = Path(plan['source'])
    destination.mkdir()
    names = git(source, 'ls-files', '-z', '--cached',
                'package.json', *COPY_DIRS).split('\0')
    for name in filter(None, dict.fromkeys(names)):
        path = source / name
        if not path.exists() and not path.is_symlink():
            continue  # tracked deletion in a working tree
        if not path.is_file() or path.resolve() != path:
            raise ValueError(f'Snapshot cannot include linked or special source: {name}')
        target = destination / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, target)
    # Copy the prepared monorepo dependency closure, not personal npm caches. Workspace
    # links stay relative, and may resolve only to workspace packages inside the copy.
    dependency_root = source / 'node_modules' if (source / 'node_modules').is_dir() else staging / 'node_modules'
    dependency_root = dependency_root.resolve(strict=True)
    if dependency_root.parent not in {source, staging}:
        raise ValueError('Dependency root escapes the source workspace')
    allowed = {'node_modules', *COPY_DIRS}
    for folder, dirs, files in os.walk(dependency_root, followlinks=False):
        for name in (*dirs, *files):
            link = Path(folder) / name
            if link.is_symlink():
                rel = os.readlink(link)
                target = (link.parent / rel).resolve()
                if Path(rel).is_absolute() or not target.is_relative_to(dependency_root.parent) or target.relative_to(dependency_root.parent).parts[0] not in allowed:
                    raise ValueError('Dependency link escapes the prepared workspace')
    shutil.copytree(dependency_root, destination / 'node_modules', symlinks=True,
                    ignore=lambda _, names: {n for n in names if n.startswith('.') and n not in {'.bin', '.pnpm'}})


def provision(root, env, source, live, approval, provider):
    if provider == 'agnes':
        seed_credentials(root, env / 'dsh-home')
    profile = env / 'dsh-home/profiles/web'
    profile.mkdir(parents=True, exist_ok=True)
    paths = {key: source / subdir for key, subdir in PLUGIN_PATHS.items()}
    manifest = {'name': 'dsh-profile-web', 'private': True,
                'dependencies': {PLUGIN_NAMES[key]: 'link:' + str(path) for key, path in paths.items()},
                'dsh': {'profile': {'bundles': [*BASE_BUNDLES, *PLUGIN_NAMES.values()]}}}
    (profile / 'package.json').write_text(json.dumps(manifest, indent=2) + '\n')
    # DSH resolves link: dependencies from profile node_modules; no registry or install hooks.
    modules = profile / 'node_modules'
    modules.mkdir(exist_ok=True)
    for key, path in paths.items():
        link = modules / PLUGIN_NAMES[key]
        if link.is_symlink():
            link.unlink()
        link.symlink_to(path, target_is_directory=True)
    instance = {'enabled': True, **({'fishballLiveRepo': str(source)} if live else {})}
    patch = [{'id': 'dsh-connector', 'config': {'approval': {'port': approval}}},
             {'id': 'dsh-instance', 'config': instance}, *provider_patch(provider)]
    patch_path = profile / 'cordis.patch.yml'
    # Connector token entries are stored in the writable profile patch, not a CLI overlay.
    if patch_path.is_symlink():
        raise ValueError('Linked parent profile patch refused')
    if patch_path.exists():
        yaml = root / 'shared/sdk/node_modules/yaml'
        merge = """
const fs = require('node:fs');
const yaml = require(process.argv[1]);
const old = yaml.parse(fs.readFileSync(process.argv[2], 'utf8')) ?? [];
if (!Array.isArray(old)) process.exit(1);
for (const row of JSON.parse(fs.readFileSync(0, 'utf8'))) {
  const index = old.findIndex(item => item?.id === row.id);
  if (index < 0) old.push(row);
  else old[index] = { ...old[index], ...row, ...(row.config && {
    config: { ...old[index].config, ...row.config, ...(row.config.approval && {
      approval: { ...old[index].config?.approval, ...row.config.approval }
    }) }
  }) };
}
process.stdout.write(JSON.stringify(old));
"""
        patch = json.loads(subprocess.check_output(['/opt/homebrew/bin/node', '-e', merge, str(yaml), str(patch_path)],
                                                    text=True, input=json.dumps(patch), stderr=subprocess.DEVNULL, env={}))
    patch_path.write_text(json.dumps(patch, indent=2) + '\n')
