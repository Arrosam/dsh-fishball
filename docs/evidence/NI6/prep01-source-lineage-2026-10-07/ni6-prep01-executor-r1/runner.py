"""Root-owned exact NI6-PREP01 r2 executor; no arbitrary command or retry."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import signal
import stat
import subprocess
import sys
import time

ROOT = Path('/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball')
CAPSULE = ROOT / '.runtime/ni6-public-preparation-r2'
OWN = ROOT / '.runtime/ni6-prep01-executor-r1'
HOST = ROOT / '.runtime/dsh-web'
NODE = '/opt/homebrew/opt/node@22/bin/node'
PYTHON = '/opt/homebrew/bin/python3'
NODE_REAL = '/opt/homebrew/Cellar/node@22/22.22.2_1/bin/node'
PYTHON_REAL = '/opt/homebrew/Cellar/python@3.14/3.14.5/Frameworks/Python.framework/Versions/3.14/bin/python3.14'
BINARY_HASHES = {
    NODE_REAL: '463b47d6e984e4f84cd2421dabf5081414e40ab9d967e828b2db7858e707f6de',
    PYTHON_REAL: '2477b47fa3ae65b9574eb18a15edb364e96948eaa1875ad3f1c80d780efc9c12',
}
GRAPH_NAME = '.runtime/ni3-native-runtime/public-graph-pins.json'
AC_NAME = 'docs/ni6-preparation-r2-executor-freeze-2026-10-07.md'
AC_HASH = '63197b73ef53b8b40e2185cb88b225474db347311e85edffbef20c08db43a9bb'
DIAGNOSTIC_NAME = 'docs/contracts/ni6-public-preparation-diagnostic-v1.md'
EXECUTOR_REPORTS = [
    'docs/evidence/NI6/public-preparation-r2-executor-independent-design.md',
    'docs/evidence/NI6/public-preparation-r2-executor-independent-design.json',
    'docs/evidence/NI6/public-preparation-r2-executor-independent-source-review.md',
    'docs/evidence/NI6/public-preparation-r2-executor-independent-source-review.json',
    'docs/evidence/NI6/public-preparation-r2-executor-independent-test-review.md',
    'docs/evidence/NI6/public-preparation-r2-executor-independent-test-review.json',
]
ENV_ABSENT = ('NODE_OPTIONS', 'NODE_PATH', 'NODE_TEST_CONTEXT', 'PYTHONPATH', 'PYTHONHOME',
              'DYLD_INSERT_LIBRARIES', 'DYLD_LIBRARY_PATH', 'DYLD_FRAMEWORK_PATH')
STREAM_CAP = 1048576
AGGREGATE_CAP = 2097152
ACTIVE_CAP = 180.0
COMMAND_CAP = 60.0
sha = lambda data: hashlib.sha256(data).hexdigest()
now = lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()


class Stop(Exception):
    pass


def need(condition, code):
    if not condition:
        raise Stop(code)


def contained(name, *, absent=False):
    need(isinstance(name, str) and not name.startswith('/') and name != ''
         and all(part not in ('', '.', '..') for part in name.split('/')), 'EXECUTOR_PATH')
    path = ROOT / name
    need(path.resolve() == path and path.is_relative_to(ROOT), 'EXECUTOR_CONTAINMENT')
    if not absent:
        need(path.is_file() and not path.is_symlink(), 'EXECUTOR_REGULAR_FILE')
    return path


def pin_path(name):
    if name in BINARY_HASHES:
        path = Path(name)
        need(path.resolve() == path and path.is_file() and not path.is_symlink(), 'EXECUTOR_BINARY_FILE')
        return path
    return contained(name)


def read_json(path, maximum=8388608):
    raw = path.read_bytes()
    need(len(raw) <= maximum, 'EXECUTOR_JSON_BOUND')
    return json.loads(raw)


def private_directory(path):
    path.mkdir(mode=0o700)
    s = path.lstat()
    need(path.resolve() == path and stat.S_ISDIR(s.st_mode) and s.st_uid == os.getuid()
         and stat.S_IMODE(s.st_mode) == 0o700, 'EXECUTOR_PRIVATE_DIRECTORY')


def exclusive(path):
    return os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600), 'wb')


def save(path, value, *, fresh=False):
    raw = (json.dumps(value, indent=2, sort_keys=True) + '\n').encode()
    if fresh:
        with exclusive(path) as handle:
            handle.write(raw)
    else:
        s = path.lstat()
        need(stat.S_ISREG(s.st_mode) and not path.is_symlink() and s.st_uid == os.getuid()
             and stat.S_IMODE(s.st_mode) == 0o600, 'EXECUTOR_OWNED_RECORD')
        fd = os.open(path, os.O_WRONLY | os.O_TRUNC | os.O_NOFOLLOW)
        with os.fdopen(fd, 'wb') as handle:
            handle.write(raw)


def verify(pins, graph, deadline):
    checked = 0
    for name, digest in pins.items():
        need(time.monotonic() < deadline, 'EXECUTOR_VERIFICATION_DEADLINE')
        need(isinstance(digest, str) and re.fullmatch('[a-f0-9]{64}', digest), 'EXECUTOR_DIGEST')
        need(sha(pin_path(name).read_bytes()) == digest, 'EXECUTOR_PIN_DRIFT')
        checked += 1
    need(graph['root'] == str(HOST) and len(graph['files']) == 27577
         and len(graph['links']) == 12, 'EXECUTOR_HOST_GRAPH')
    for name, digest in graph['files'].items():
        need(time.monotonic() < deadline, 'EXECUTOR_VERIFICATION_DEADLINE')
        path = contained(str(Path('.runtime/dsh-web') / name))
        need(sha(path.read_bytes()) == digest, 'EXECUTOR_HOST_DRIFT')
    for name, row in graph['links'].items():
        need(time.monotonic() < deadline, 'EXECUTOR_VERIFICATION_DEADLINE')
        path = HOST / name
        need(not Path(name).is_absolute() and all(p not in ('', '.', '..') for p in name.split('/'))
             and path.is_symlink() and os.readlink(path) == row['target']
             and str(path.resolve()) == row['resolved'], 'EXECUTOR_HOST_LINK')
    return {'checkedAt': now(), 'inputCount': checked, 'wholeHostFiles': 27577,
            'wholeHostLinks': 12, 'complete': True, 'unchanged': True}


def group_exists(pgid):
    try:
        os.killpg(pgid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return None


def run_command(argv, index, private, deadline):
    started = time.monotonic()
    hard_end = min(started + COMMAND_CAP, deadline)
    work_end = hard_end - 4.0
    need(work_end > started, 'EXECUTOR_COMMAND_BUDGET')
    paths = {name: private / f'command-{index:02d}.{name}.bin' for name in ('stdout', 'stderr')}
    handles = {name: exclusive(path) for name, path in paths.items()}
    row = {'index': index, 'argv': argv, 'startedAt': now(), 'exitCode': None,
           'timedOut': False, 'overflow': False, 'interrupted': False,
           'processGroupState': 'NOT_STARTED', 'signalAttempts': [], 'signalOutcomes': [], 'failureCode': None}
    received = {'stdout': 0, 'stderr': 0}
    stored = {'stdout': 0, 'stderr': 0}
    process = None
    selector = selectors.DefaultSelector()
    pipes = []
    try:
        process = subprocess.Popen(argv, cwd=ROOT, stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=False, start_new_session=True)
        row['childPid'] = row['ownedProcessGroup'] = process.pid
        row['processGroupState'] = 'OWNED_NEW_SESSION'
        for name, pipe in (('stdout', process.stdout), ('stderr', process.stderr)):
            os.set_blocking(pipe.fileno(), False)
            selector.register(pipe, selectors.EVENT_READ, name)
            pipes.append(pipe)
        while selector.get_map() or process.poll() is None:
            if time.monotonic() >= work_end:
                row['timedOut'] = True
                row['failureCode'] = 'EXECUTOR_COMMAND_TIMEOUT'
                break
            for key, _ in selector.select(timeout=min(0.05, max(0, work_end - time.monotonic()))):
                chunk = os.read(key.fileobj.fileno(), 65536)
                if not chunk:
                    selector.unregister(key.fileobj)
                    continue
                name = key.data
                received[name] += len(chunk)
                amount = min(len(chunk), STREAM_CAP - stored[name], AGGREGATE_CAP - sum(stored.values()))
                if amount:
                    handles[name].write(chunk[:amount])
                    stored[name] += amount
                if amount < len(chunk):
                    row['overflow'] = True
                    row['failureCode'] = 'EXECUTOR_OUTPUT_BOUND'
                    break
            if row['overflow']:
                break
        if process.poll() is not None:
            row['exitCode'] = process.returncode
        remaining_group = group_exists(process.pid)
        if remaining_group is not False and row['failureCode'] is None:
            row['failureCode'] = 'EXECUTOR_GROUP_REMAINS'
        if row['failureCode'] is not None and remaining_group is not False:
            for sig, allowance in ((signal.SIGTERM, 2.0), (signal.SIGKILL, 2.0)):
                if group_exists(process.pid) is False:
                    break
                row['signalAttempts'].append(sig.name)
                try:
                    os.killpg(process.pid, sig)
                    row['signalOutcomes'].append('SUBMITTED')
                except ProcessLookupError:
                    row['signalOutcomes'].append('ALREADY_ABSENT')
                except PermissionError:
                    row['signalOutcomes'].append('DENIED_UNKNOWN')
                until = min(time.monotonic() + allowance, hard_end)
                while time.monotonic() < until:
                    process.poll()  # Reap only the owned leader; no unrelated process query.
                    if group_exists(process.pid) is False:
                        break
                    time.sleep(min(0.05, max(0, until - time.monotonic())))
        process.poll()
        row['exitCode'] = process.returncode
        state = group_exists(process.pid)
        row['processGroupState'] = 'ABSENT_OBSERVED' if state is False else 'UNKNOWN_OR_REMAINS'
        if row['exitCode'] != 0 and row['failureCode'] is None:
            row['failureCode'] = 'EXECUTOR_COMMAND_NONZERO'
    except (KeyboardInterrupt, InterruptedError):
        row['interrupted'] = True
        row['failureCode'] = 'EXECUTOR_INTERRUPTED'
        # Finally performs the same owned-only bounded cleanup for an interruption.
    except (OSError, ValueError):
        row['failureCode'] = 'EXECUTOR_SPAWN_OR_CAPTURE_FAILED'
    finally:
        if process is not None and group_exists(process.pid) is not False:
            for sig in (signal.SIGTERM, signal.SIGKILL):
                if sig.name in row['signalAttempts'] or group_exists(process.pid) is False:
                    continue
                if time.monotonic() >= hard_end:
                    break
                row['signalAttempts'].append(sig.name)
                try:
                    os.killpg(process.pid, sig)
                    row['signalOutcomes'].append('SUBMITTED')
                except ProcessLookupError:
                    row['signalOutcomes'].append('ALREADY_ABSENT')
                except PermissionError:
                    row['signalOutcomes'].append('DENIED_UNKNOWN')
                until = min(time.monotonic() + 2.0, hard_end)
                while time.monotonic() < until:
                    process.poll()
                    if group_exists(process.pid) is False:
                        break
                    time.sleep(min(0.05, max(0, until - time.monotonic())))
            process.poll()
            row['exitCode'] = process.returncode
            row['processGroupState'] = 'ABSENT_OBSERVED' if group_exists(process.pid) is False else 'UNKNOWN_OR_REMAINS'
        selector.close()
        for pipe in pipes:
            pipe.close()
        for handle in handles.values():
            handle.close()
        row['finishedAt'] = now()
        row['durationSeconds'] = round(time.monotonic() - started, 6)
        row['privateStreams'] = {
            name: {'bytes': stored[name], 'sha256': sha(path.read_bytes()),
                   'receivedAtLeastBytes': received[name], 'truncated': received[name] > stored[name]}
            for name, path in paths.items()
        }
        row['remoteTermination'] = 'NOT_CLAIMED'
        row['reservationRelease'] = 'NOT_CLAIMED'
    return row, paths


def safe_tap(paths):
    # Never return a raw line, test name, assertion payload or arbitrary JSON.
    counts = {}
    for line in paths['stdout'].read_bytes().splitlines():
        match = re.fullmatch(rb'# (tests|suites|pass|fail|cancelled|skipped|todo) ([0-9]{1,5})', line)
        if match:
            name, value = match[1].decode('ascii'), int(match[2])
            need(name not in counts and value <= 10000, 'EXECUTOR_TAP_COUNT')
            counts[name] = value
    return counts


def safe_functional(paths):
    fields = {'contractVersion', 'requests', 'taskRef', 'contextRecordRef', 'contextDigest',
              'taskVersion', 'sourceTaskVersion', 'memoryRevision', 'nativeEvents',
              'liveRegistryInspections', 'entryDisposed', 'rootDisposed',
              'contextCheckTypedCurrentness', 'acceptance'}
    selected = []
    for line in paths['stdout'].read_bytes().splitlines():
        if not line.startswith(b'# {"contractVersion":"df.ni6-prep01-public-result/v1"'):
            continue
        need(len(line) <= 8192, 'EXECUTOR_DIAGNOSTIC_BOUND')
        value = json.loads(line[2:])
        need(isinstance(value, dict) and set(value) == fields, 'EXECUTOR_DIAGNOSTIC_FIELDS')
        need(value['contractVersion'] == 'df.ni6-prep01-public-result/v1'
             and value['acceptance'] == 'HOLD'
             and value['contextCheckTypedCurrentness'] == 'OUTSIDE_SELECTED_PUBLIC_RPC_SLICE', 'EXECUTOR_DIAGNOSTIC_ENUM')
        for name in ('taskRef', 'contextRecordRef', 'contextDigest'):
            need(isinstance(value[name], str) and re.fullmatch('[a-f0-9]{64}', value[name]), 'EXECUTOR_DIAGNOSTIC_REFERENCE')
        for name in ('taskVersion', 'sourceTaskVersion', 'memoryRevision', 'liveRegistryInspections'):
            need(type(value[name]) is int and 0 <= value[name] <= 9007199254740991, 'EXECUTOR_DIAGNOSTIC_INTEGER')
        need(value['sourceTaskVersion'] >= 1 and value['taskVersion'] == value['sourceTaskVersion'] + 1
             and value['memoryRevision'] == 0 and value['liveRegistryInspections'] == 44
             and value['entryDisposed'] is True and value['rootDisposed'] is True, 'EXECUTOR_DIAGNOSTIC_FACTS')
        need(value['requests'] == {'authExchanges': 1, 'domainRpcAttempts': 18,
                                  'postDisposalHttp': 1, 'httpRequests': 20}, 'EXECUTOR_DIAGNOSTIC_REQUESTS')
        zero = {'agentCreated': 0, 'agentDisposed': 0, 'sessionCreated': 0, 'sessionDisposed': 0,
                'sessionEvents': 0, 'streams': 0, 'tools': 0}
        need(value['nativeEvents'] == zero and all(type(n) is int for n in value['nativeEvents'].values())
             and all(type(n) is int for n in value['requests'].values()), 'EXECUTOR_DIAGNOSTIC_ZERO_EVENTS')
        selected.append(value)
    need(len(selected) == 1, 'EXECUTOR_DIAGNOSTIC_REQUIRED_ONCE')
    return selected[0]


def exact_commands(phase, proposal):
    base = str(CAPSULE)
    if phase == 'build':
        expected = [
            [PYTHON, base + '/verify-built-package.py', '--prebuild'],
            [NODE, base + '/package/scripts/build-client.mjs'],
            [PYTHON, base + '/package/scripts/build-native-source-manifest.py',
             '--product-root', base + '/package', '--host-root', str(HOST)],
            [PYTHON, base + '/verify-built-package.py', '--seal-built'],
        ]
    else:
        relative = str(CAPSULE.relative_to(ROOT))
        names = ['public-oracles.mjs', 'http-rpc.mjs', 'original-bootstrap.mjs',
                 'preflight.mjs', 'public-preparation.test.mjs', 'fixture-oracles.test.mjs']
        expected = [[NODE, '--check', relative + '/' + name] for name in names]
        expected += [[NODE, '--test', '--test-concurrency=1', relative + '/' + name]
                     for name in ('fixture-oracles.test.mjs', 'public-preparation.test.mjs')]
    need(proposal['commands'] == expected, 'EXECUTOR_EXACT_COMMANDS')
    return expected


def main():
    phase_started = time.monotonic()
    need(len(sys.argv) == 4 and sys.argv[1] == '--phase' and sys.argv[2] in ('build', 'test'), 'EXECUTOR_ARGUMENTS')
    phase = sys.argv[2]
    plan_name = '.runtime/root-ni6-public-preparation-r2-' + ('build-plan.json' if phase == 'build' else 'execution-plan.json')
    need(sys.argv[3] == plan_name and Path.cwd() == ROOT and ROOT.resolve() == ROOT
         and Path(__file__).resolve() == OWN / 'runner.py', 'EXECUTOR_IDENTITY')
    need(str(Path(sys.executable).resolve()) == PYTHON_REAL, 'EXECUTOR_PYTHON')
    need(not any(name in os.environ for name in ENV_ABSENT), 'EXECUTOR_ENVIRONMENT')
    need(str(Path(NODE).resolve()) == NODE_REAL and str(Path(PYTHON).resolve()) == PYTHON_REAL, 'EXECUTOR_CANONICAL_BINARIES')
    own_stat = OWN.lstat()
    need(OWN.resolve() == OWN and stat.S_ISDIR(own_stat.st_mode)
         and own_stat.st_uid == os.getuid() and stat.S_IMODE(own_stat.st_mode) == 0o700, 'EXECUTOR_NAMESPACE_OWNERSHIP')
    plan_path = contained(plan_name)
    plan = read_json(plan_path)
    go_key = 'rootReviewedBuildGO' if phase == 'build' else 'rootReviewedExecutionGO'
    need(plan[go_key] is True and plan['runCountAuthorized'] == 1 and plan['all87'] == 'HOLD'
         and plan['CODE'] == 'BLOCKED_UNCHANGED' and plan['accepted'] == 0, 'EXECUTOR_GO')
    manifest_name = str(CAPSULE.relative_to(ROOT)) + '/source-manifest.json'
    manifest = read_json(contained(manifest_name))
    proposal_name = str(CAPSULE.relative_to(ROOT)) + ('/build-plan.proposed.json' if phase == 'build' else '/test-plan.proposed.json')
    proposal = read_json(contained(proposal_name))
    commands = exact_commands(phase, proposal)
    need(plan['commands'] == commands and plan['publicGraphManifest'] == GRAPH_NAME, 'EXECUTOR_PLAN_SELECTION')
    pins = dict(plan['pins'])
    required = set()
    for record in manifest['ownedFiles'] + manifest['inputFiles']:
        name = record['path']
        need(name not in required, 'EXECUTOR_DUPLICATE_MANIFEST_PIN')
        raw = pin_path(name).read_bytes()
        need(len(raw) == record['bytes'] and sha(raw) == record['sha256'], 'EXECUTOR_MANIFEST_DRIFT')
        need(pins.get(name) == record['sha256'], 'EXECUTOR_COMPLETE_MANIFEST_PINS')
        required.add(name)
    required.update([manifest_name, proposal_name, GRAPH_NAME, AC_NAME, DIAGNOSTIC_NAME,
                     '.runtime/ni6-prep01-executor-r1/runner.py',
                     '.runtime/ni6-prep01-executor-r1/source-manifest.json'])
    required.update(manifest['requiredAffectedReviews'])
    required.update(EXECUTOR_REPORTS)
    if phase == 'test':
        required.update(str(CAPSULE.relative_to(ROOT)) + '/' + name for name in (
            'package/lib/client.js', 'package/native-source-manifest.json', 'build-attempt.json', 'build-readback.json'))
        required.add('docs/evidence/NI6/public-preparation-r2-build/command-results.json')
    need(required == set(pins), 'EXECUTOR_PIN_SET')
    need(pins[AC_NAME] == AC_HASH and all(pins.get(name) == digest for name, digest in BINARY_HASHES.items()), 'EXECUTOR_FROZEN_BASELINE')
    pins[plan_name] = sha(plan_path.read_bytes())
    graph = read_json(contained(GRAPH_NAME))
    ledger_path = OWN / 'wave-ledger.json'
    if phase == 'build':
        need(not ledger_path.exists(), 'EXECUTOR_BUILD_ALREADY_CONSUMED')
        ledger = {'contractVersion': 'df.ni6-prep01-executor-ledger/v1', 'sourceManifestSha256': pins[manifest_name],
                  'activeSeconds': 0.0, 'build': 'IN_PROGRESS', 'test': 'UNCONSUMED', 'phases': []}
        save(ledger_path, ledger, fresh=True)
    else:
        need(ledger_path.is_file() and not ledger_path.is_symlink(), 'EXECUTOR_BUILD_REQUIRED')
        s = ledger_path.lstat()
        need(s.st_uid == os.getuid() and stat.S_IMODE(s.st_mode) == 0o600, 'EXECUTOR_LEDGER_OWNERSHIP')
        ledger = read_json(ledger_path, 65536)
        need(ledger['contractVersion'] == 'df.ni6-prep01-executor-ledger/v1'
             and ledger['sourceManifestSha256'] == pins[manifest_name]
             and ledger['build'] == 'PASS' and ledger['test'] == 'UNCONSUMED'
             and isinstance(ledger['activeSeconds'], (int, float))
             and 0 <= ledger['activeSeconds'] < ACTIVE_CAP, 'EXECUTOR_PHASE_ORDER')
        ledger['test'] = 'IN_PROGRESS'
        save(ledger_path, ledger)
    deadline = phase_started + ACTIVE_CAP - ledger['activeSeconds']
    evidence_name = 'docs/evidence/NI6/public-preparation-r2-' + ('build' if phase == 'build' else 'execution')
    need(plan['evidenceDirectory'] == evidence_name, 'EXECUTOR_EVIDENCE_PATH')
    evidence = contained(evidence_name, absent=True)
    private = OWN / ('private-' + phase)
    need(not evidence.exists() and not private.exists(), 'EXECUTOR_PHASE_ALREADY_CONSUMED')
    private_directory(evidence)
    private_directory(private)
    need(stat.S_IMODE(OWN.stat().st_mode) == 0o700 and OWN.stat().st_uid == os.getuid(), 'EXECUTOR_NAMESPACE_OWNERSHIP')
    rows, failed, final_code = [], False, None
    freeze = dict(plan)
    freeze.update({'executorContract': 'df.ni6-prep01-executor/v1', 'phase': phase,
                   'createdAt': now(), 'pins': pins, 'activeBudgetSecondsBefore': ledger['activeSeconds'],
                   'commandCapSeconds': COMMAND_CAP, 'activeAggregateCapSeconds': ACTIVE_CAP,
                   'streamCapBytes': STREAM_CAP, 'combinedStreamCapBytes': AGGREGATE_CAP,
                   'rawStreams': 'PRIVATE_NOT_COPIED', 'noRetry': True})
    save(evidence / 'root-execution-freeze.json', freeze, fresh=True)
    try:
        before = verify(pins, graph, deadline - 5)
        save(evidence / 'root-before-verification.json', before, fresh=True)
        allowed_copies = {row['path'] for row in manifest['ownedFiles']}
        allowed_copies.update(required - {row['path'] for row in manifest['inputFiles']})
        for name in plan['sourceCopies']:
            need(name in allowed_copies and name in pins and not name.startswith('/')
                 and '/private-runtime/' not in name and '/private-' not in name, 'EXECUTOR_SOURCE_COPY')
            need(time.monotonic() < deadline - 5, 'EXECUTOR_COPY_DEADLINE')
            target = evidence / 'frozen-source' / name.removeprefix('.runtime/')
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            raw = pin_path(name).read_bytes()
            need(sha(raw) == pins[name], 'EXECUTOR_COPY_PIN_DRIFT')
            with exclusive(target) as handle:
                handle.write(raw)
        for index, argv in enumerate(commands, 1):
            need(time.monotonic() < deadline - 9, 'EXECUTOR_AGGREGATE_DEADLINE')
            row, paths = run_command(argv, index, private, deadline - 5)
            if '--test' in argv and row['failureCode'] is None:
                try:
                    row['tapCounts'] = safe_tap(paths)
                    count = 31 if argv[-1].endswith('/fixture-oracles.test.mjs') else 1
                    need(row['tapCounts'] == {'tests': count, 'suites': 0, 'pass': count, 'fail': 0,
                                             'cancelled': 0, 'skipped': 0, 'todo': 0}, 'EXECUTOR_EXACT_TAP_COUNTS')
                    if argv[-1].endswith('/public-preparation.test.mjs'):
                        row['publicDiagnostic'] = safe_functional(paths)
                except (Stop, OSError, ValueError, KeyError, TypeError) as error:
                    row['failureCode'] = str(error) if isinstance(error, Stop) else 'EXECUTOR_OUTPUT_REJECTED'
            rows.append(row)
            failed = row['failureCode'] is not None
            save(evidence / 'command-results.json', {'commands': rows, 'executionEvidenceOnly': True,
                 'stoppedAfterFirstFailure': failed, 'remainingCommandsNotRun': commands[index:] if failed else [],
                 'all87': 'HOLD', 'CODE': 'BLOCKED_UNCHANGED'}, fresh=index == 1)
            print(json.dumps({'phase': phase, 'index': index, 'exitCode': row['exitCode'],
                  'failureCode': row['failureCode'], 'seconds': row['durationSeconds']}), flush=True)
            if failed:
                final_code = row['failureCode']
                break
        after = verify(pins, graph, deadline)
        save(evidence / 'root-after-verification.json', after, fresh=True)
    except (Stop, OSError, ValueError, KeyError, KeyboardInterrupt) as error:
        failed = True
        final_code = str(error) if isinstance(error, Stop) else 'EXECUTOR_PHASE_FAILED'
        after_path = evidence / 'root-after-verification.json'
        if not after_path.exists():
            save(after_path, {'checkedAt': now(), 'complete': False, 'unchanged': 'UNKNOWN',
                             'failureCode': final_code, 'noAcceptancePromotion': True}, fresh=True)
    finally:
        elapsed = time.monotonic() - phase_started
        ledger['activeSeconds'] += elapsed
        if ledger['activeSeconds'] >= ACTIVE_CAP:
            failed, final_code = True, 'EXECUTOR_AGGREGATE_DEADLINE'
        ledger[phase] = 'FAILED_HOLD' if failed else 'PASS'
        ledger['phases'].append({'phase': phase, 'finishedAt': now(), 'activeSeconds': elapsed,
                                 'commandsObserved': len(rows), 'result': ledger[phase]})
        save(ledger_path, ledger)
        save(evidence / 'root-phase-result.json', {'phase': phase, 'result': ledger[phase],
             'failureCode': final_code, 'activeSeconds': round(elapsed, 6),
             'aggregateActiveSeconds': round(ledger['activeSeconds'], 6), 'commandsObserved': len(rows),
             'all87': 'HOLD', 'CODE': 'BLOCKED_UNCHANGED', 'accepted': 0,
             'nativeTermination': 'NOT_CLAIMED', 'reservationRelease': 'NOT_CLAIMED'}, fresh=True)
    return 1 if failed else 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (Stop, OSError, ValueError, KeyError, KeyboardInterrupt) as error:
        print(str(error) if isinstance(error, Stop) else 'EXECUTOR_ADMISSION_FAILED', file=sys.stderr)
        sys.exit(1)
