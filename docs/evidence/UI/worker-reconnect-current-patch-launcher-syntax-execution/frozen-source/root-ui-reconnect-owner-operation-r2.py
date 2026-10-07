"""Root-owned finite QA maintenance; no CLI, browser, private reads or inference."""
import datetime
import getpass
import hashlib
import json
import os
from pathlib import Path
import signal
import stat
import subprocess
import sys
import time

ROOT = Path('/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball')
BASE = ROOT / '.runtime/ui-qa-a58c522'
CAPSULE = ROOT / '.runtime/ui-worker-reconnect-service-plan-r3'
AMENDMENT = ROOT / '.runtime/ui-worker-reconnect-public-patch-amendment'
SERVICE = ROOT / '.runtime/ui-worker-reconnect-service-r2'
EVIDENCE = ROOT / 'docs/evidence/UI/worker-reconnect-service-root-execution'
ACTIVE = BASE / 'home/profiles/web/node_modules/dsh-fishball'
STAGED = ROOT / '.runtime/ui-qa-client-cb75/package'
NODE = Path('/opt/homebrew/Cellar/node@22/22.22.2_1/bin/node')
sha = lambda data: hashlib.sha256(data).hexdigest()
now = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()

def require(value, code):
    if not value:
        raise RuntimeError(code)

def pin(path, digest, size=None):
    require(path.is_file() and not path.is_symlink(), 'PUBLIC_PIN_NOT_REGULAR')
    require(size is None or path.stat().st_size == size, 'PUBLIC_PIN_SIZE_CHANGED')
    require(sha(path.read_bytes()) == digest, 'PUBLIC_PIN_CHANGED')

def absent(path):
    require(not os.path.lexists(path), 'EXPECTED_PATH_NOT_ABSENT')

def fact(path, directory=False):
    s = path.lstat()
    require(path.resolve() == path and not path.is_symlink(), 'CANONICAL_PATH_REQUIRED')
    require(s.st_uid == os.getuid() and stat.S_IMODE(s.st_mode) == (0o700 if directory else 0o600), 'OWNER_MODE_REQUIRED')
    require(stat.S_ISDIR(s.st_mode) if directory else stat.S_ISREG(s.st_mode), 'PATH_TYPE_CHANGED')
    return {'device': s.st_dev, 'inode': s.st_ino, 'uid': s.st_uid,
            'mode': oct(stat.S_IMODE(s.st_mode)), 'bytes': s.st_size, 'mtimeNs': s.st_mtime_ns}

def bindings():
    directories = ['home', 'workspace', 'agents', 'private', 'evidence',
                   'home/profiles/web', 'home/profiles/web/df-data',
                   'home/profiles/web/df-data/runtime.sqlite.df-setup']
    files = ['private/browser-auth.yml', 'home/profiles/web/df-data/runtime.sqlite',
             'home/profiles/web/df-data/runtime.sqlite.df-setup/key.bin',
             'home/profiles/web/df-data/runtime.sqlite.df-setup/state.json']
    # Private files are lstat only. Never open, copy, hash or interpret them.
    return {name: fact(BASE / name, name in directories) for name in directories + files}

def preserve(expected):
    observed = bindings()
    for name, before in expected.items():
        after = observed[name]
        require(all(after[k] == before[k] for k in ['device', 'inode', 'uid', 'mode']), 'PRESERVED_BINDING_CHANGED')
        if name != 'home/profiles/web/df-data/runtime.sqlite':
            if not name in ['home', 'workspace', 'agents', 'private', 'evidence', 'home/profiles/web', 'home/profiles/web/df-data', 'home/profiles/web/df-data/runtime.sqlite.df-setup']:
                require(after['bytes'] == before['bytes'] and after['mtimeNs'] == before['mtimeNs'], 'PRESERVED_PRIVATE_METADATA_CHANGED')
    return observed

def inventory(root, rows):
    require(root.resolve() == root and not root.is_symlink() and root.is_dir(), 'PACKAGE_ROOT_INVALID')
    names = []
    for directory, dirs, files in os.walk(root, followlinks=False):
        for name in dirs + files:
            p = Path(directory) / name
            require(not p.is_symlink(), 'PACKAGE_LINK_FORBIDDEN')
        for name in files:
            p = Path(directory) / name
            require(stat.S_ISREG(p.lstat().st_mode), 'PACKAGE_SPECIAL_FILE_FORBIDDEN')
            names.append(p.relative_to(root).as_posix())
    require(len(rows) == 1114 and sorted(names) == sorted(row['path'] for row in rows), 'PACKAGE_INVENTORY_CHANGED')
    for row in rows:
        pin(root / row['path'], row['sha256'], row['bytes'])

def public_preflight():
    pin(CAPSULE / 'manifest.json', '4cf3b6c1891324d8016ccc4fa8dfcba5f76db9e949f4a1ca69be504b3cd4c7fd', 15313)
    pin(CAPSULE / 'closure.json', '1796aeedde275e0fc6054266fd8a78c87dcd86c15bb00f6e31b9ceac2a610635', 4663)
    closure = json.loads((CAPSULE / 'closure.json').read_text())
    for row in closure['files']:
        pin(ROOT / row['path'], row['sha256'], row['bytes'])
    pin(ROOT / '.runtime/ui-qa-a58c522/launch.mjs', 'a93b3eb98dfcc113d201557562798767b6eaf185e3cf1cd3924bbfc13d1fd4dd', 4706)
    pin(ROOT / '.runtime/ui-qa-client-cb75/dsh-fishball-0.1.0-preview.1-ui-cb75.tgz', '55fc6802acc54bf10a63ba8a3a37e62c4dbb656aefc01d11605fc5296766f40c', 4115975)
    pin(ROOT / '.runtime/ui-qa-client-cb75/composite-package-manifest.json', '424c679c2add09e3163823c940cdecc4bacce1d18375c478d11ff0af188fefe4', 353203)
    # Narrow amendment preserves the current public welcome acknowledgement.
    pin(AMENDMENT / 'amendment.json', '5c24e655221af7c2d477553caa6b3f753ff9715c4c178edab0e1b9d7c159e924', 5611)
    pin(AMENDMENT / 'lifecycle-pins.successor.json', '4d89f7d9004c5e7823ff11ed1b863d9420c8073a2efba7335276587ec1e619d9', 208755)
    pin(AMENDMENT / 'lifecycle-pins.rollback.json', 'aac72c03074059f61205abc550b42dbf6c841219a3c304bc6b93af5eb2737ac6', 208696)
    pin(AMENDMENT / 'launch-successor-r2.mjs', '06769626b327dc4bfe9c726f0cf4e2ec6c2db792dfb76149df657487bb8871dd', 8457)
    plans = {mode: json.loads((AMENDMENT / f'lifecycle-pins.{mode}.json').read_text()) for mode in ['successor', 'rollback']}
    for plan in plans.values():
        for row in plan['publicInputs']:
            p = Path(row['path'])
            if p.parent == SERVICE:
                p = Path(row['publicSource']) if not os.path.lexists(p) else p
            pin(p, row['sha256'], row['bytes'])
    root = BASE / 'home/profiles/web/cordis.yml'
    fact(root)
    pin(root, 'c300dcf2ebc5f02062d6591268d29d3db6fe45e0cb138f5467276fe2ba06076e', 223)
    absent(BASE / 'home/cordis.patch.yml')
    absent(BASE / 'home/profiles/web/.dsh-module-fallback')
    for base in [BASE / 'home', BASE / 'workspace']:
        for directory, dirs, files in os.walk(base, followlinks=False):
            dirs[:] = [d for d in dirs if d != 'node_modules']
            require('.env' not in dirs + files, 'LAYERED_ENV_FORBIDDEN')
    require(all(k not in os.environ for k in ['NODE_OPTIONS', 'NODE_PATH', 'NODE_TEST_CONTEXT']), 'INHERITED_NODE_FLAGS_FORBIDDEN')
    for generation in ['r2-successor-1', 'r2-rollback-1']:
        for name in [f'private/fresh-native-access-{generation}.txt', f'evidence/access-ready-{generation}.json', f'private/original-cli-{generation}.stdout.log', f'private/original-cli-{generation}.stderr.log']:
            absent(BASE / name)
    return plans

def lsof(args, timeout=2):
    return subprocess.run(['/usr/sbin/lsof', '-nP'] + args, stdin=subprocess.DEVNULL,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=False, timeout=timeout)

def original_owned():
    listener = lsof(['-R', '-iTCP:3080', '-sTCP:LISTEN'])
    rows = listener.stdout.decode().splitlines()
    require(listener.returncode == 0 and not listener.stderr and len(rows) == 2, 'ORIGINAL_SINGLETON_NOT_VERIFIED')
    fields = rows[1].split()
    require(fields[:4] == ['node', '91027', '91018', getpass.getuser()] and fields[-2:] == ['127.0.0.1:3080', '(LISTEN)'], 'ORIGINAL_LISTENER_OWNER_CHANGED')
    wrapper = lsof(['-a', '-p', '91018', '-d', 'cwd,txt'])
    require(wrapper.returncode == 0 and not wrapper.stderr, 'ORIGINAL_WRAPPER_NOT_VERIFIED')
    text = wrapper.stdout.decode()
    require(any(' cwd ' in line and line.endswith(str(ROOT)) for line in text.splitlines()), 'ORIGINAL_WRAPPER_CWD_CHANGED')
    require(any(' txt ' in line and line.endswith(str(NODE)) for line in text.splitlines()), 'ORIGINAL_WRAPPER_NODE_CHANGED')
    return {'listener': listener.stdout.decode(), 'wrapper': text}

def save_new(path, value):
    with path.open('x', encoding='utf8') as output:
        os.chmod(path, 0o600)
        output.write(json.dumps(value, indent=2, sort_keys=True) + '\n')

require(not sys.flags.optimize and len(sys.argv) == 2 and sys.argv[1] in ['prepare', 'stop', 'activate'], 'EXACT_UNOPTIMIZED_OPERATION_REQUIRED')
os.umask(0o077)
phase = sys.argv[1]
plans = public_preflight()
if phase == 'prepare':
    absent(SERVICE); absent(EVIDENCE)
    inventory(ACTIVE, plans['rollback']['installedFiles'])
    inventory(STAGED, plans['successor']['installedFiles'])
    require(ACTIVE.stat().st_dev == STAGED.stat().st_dev == ROOT.stat().st_dev, 'SAME_FILESYSTEM_REQUIRED')
    observed = bindings(); ownership = original_owned()
    EVIDENCE.mkdir(mode=0o700)
    SERVICE.mkdir(mode=0o700)
    for name in ['lifecycle-pins.successor.json', 'lifecycle-pins.rollback.json', 'restart-overlay.successor.json', 'restart-overlay.rollback.json']:
        with (SERVICE / name).open('xb') as output:
            output.write(((AMENDMENT if name.startswith('lifecycle-pins.') else CAPSULE) / name).read_bytes())
        require((SERVICE / name).read_bytes() == ((AMENDMENT if name.startswith('lifecycle-pins.') else CAPSULE) / name).read_bytes(), 'COPIED_TEMPLATE_CHANGED')
    save_new(EVIDENCE / 'prepare-result.json', {'at': now(), 'result': 'PREPARED_OLD_SERVICE_UNCHANGED', 'bindingsMetadataOnly': observed, 'ownership': ownership, 'oldFilesVerified': 1114, 'newFilesVerified': 1114, 'legacyFallbackAbsent': True, 'homePatchAbsent': True, 'profileOperatorWrites': 0, 'stopSignals': 0, 'CLIStarts': 0, 'browserActions': 0, 'modelCalls': 0})
elif phase == 'stop':
    absent(EVIDENCE / 'stop-result.json')
    before = json.loads((EVIDENCE / 'prepare-result.json').read_text())
    preserve(before['bindingsMetadataOnly'])
    inventory(ACTIVE, plans['rollback']['installedFiles'])
    inventory(STAGED, plans['successor']['installedFiles'])
    ownership = original_owned()
    # Exactly one PID-directed wrapper signal; never child/group/PTY/force/retry.
    os.kill(91018, signal.SIGINT)
    started = time.monotonic(); released = False; observations = 0
    while time.monotonic() - started < 10:
        remaining = 10 - (time.monotonic() - started)
        if remaining <= 0:
            break
        check = lsof(['-iTCP:3080', '-sTCP:LISTEN'], timeout=min(2, remaining))
        observations += 1
        child_alive = True
        try:
            os.kill(91027, 0)
        except ProcessLookupError:
            child_alive = False
        if check.returncode == 1 and not check.stdout and not check.stderr and not child_alive:
            released = True
            break
        time.sleep(min(0.25, max(0, 10 - (time.monotonic() - started))))
    save_new(EVIDENCE / 'stop-result.json', {'at': now(), 'result': 'ORIGINAL_STOP_CONFIRMED' if released else 'HOLD_UNCONFIRMED_STOP_NO_RETRY', 'wrapperPID': 91018, 'childPID': 91027, 'signals': 1, 'signal': 'SIGINT', 'PIDDirected': True, 'portReleasedAndChildGone': released, 'seconds': round(time.monotonic() - started, 6), 'observations': observations, 'beforeOwnership': ownership})
    require(released, 'OWNED_STOP_NOT_CONFIRMED_HOLD_NO_RETRY')
else:
    absent(EVIDENCE / 'activate-result.json')
    stopped = json.loads((EVIDENCE / 'stop-result.json').read_text())
    require(stopped['result'] == 'ORIGINAL_STOP_CONFIRMED' and stopped['signals'] == 1, 'CONFIRMED_STOP_REQUIRED')
    check = lsof(['-iTCP:3080', '-sTCP:LISTEN'])
    require(check.returncode == 1 and not check.stdout and not check.stderr, 'PORT_NOT_FREE')
    before = json.loads((EVIDENCE / 'prepare-result.json').read_text())
    preserve(before['bindingsMetadataOnly'])
    inventory(ACTIVE, plans['rollback']['installedFiles'])
    inventory(STAGED, plans['successor']['installedFiles'])
    retained = SERVICE / 'retained-a58-package'
    absent(retained); absent(SERVICE / 'retained-composite-package')
    require(ACTIVE.stat().st_dev == STAGED.stat().st_dev == SERVICE.stat().st_dev, 'SAME_FILESYSTEM_REQUIRED')
    ACTIVE.rename(retained)
    try:
        STAGED.rename(ACTIVE)
    except OSError:
        retained.rename(ACTIVE)
        save_new(EVIDENCE / 'activate-result.json', {'at': now(), 'result': 'SECOND_RENAME_FAILED_ORIGINAL_RESTORED', 'starts': 0})
        raise
    inventory(ACTIVE, plans['successor']['installedFiles'])
    inventory(retained, plans['rollback']['installedFiles'])
    observed = preserve(before['bindingsMetadataOnly'])
    save_new(EVIDENCE / 'activate-result.json', {'at': now(), 'result': 'COMPOSITE_ACTIVE_ORIGINAL_RETAINED_NOT_STARTED', 'renames': 2, 'activeFilesVerified': 1114, 'retainedFilesVerified': 1114, 'preservedBindingsMetadataOnly': observed, 'CLIStarts': 0, 'browserActions': 0, 'modelCalls': 0, 'frontendConnection': 'NOT_OBSERVED', 'all87': 'HOLD'})
print(json.dumps({'phase': phase, 'completed': True, 'evidenceDirectory': str(EVIDENCE.relative_to(ROOT)), 'UI': 'NOT_RUN', 'all87': 'HOLD', 'CODE': 'BLOCKED_UNCHANGED'}), flush=True)
