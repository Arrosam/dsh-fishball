"""Root-owned exact NI6-PREP01 r3 executor; no arbitrary command or retry."""
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
CAPSULE = ROOT / '.runtime/ni6-public-preparation-r3'
OWN = ROOT / '.runtime/ni6-prep01-executor-r3'
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
REMEDIATION_NAME = 'docs/ni6-executor-r2-remediation-freeze-2026-10-07.md'
REMEDIATION_HASH = '5549cc59491cdf053d98b81b41a63bf01bcd607677463242f2229c3ded00f40c'
OWNERSHIP_NAME = 'docs/ni6-executor-r3-ownership-selection-freeze-2026-10-07.md'
OWNERSHIP_HASH = 'de7bba6dfacf0fe05154083df137ee7ee839d5e219357e7bed6c41812d06260d'
SELECTION_NAME = 'docs/ni6-preparation-executor-r3-coupled-selection-2026-10-07.md'
SELECTION_HASH = 'b08d264f5d6e5dd8edb81ef1a734781f75ab098b09d350baa55973717393e671'
STOP_REQUESTED = False
PHASE_BOOKKEEPING = 5.0
COMMAND_BOOKKEEPING = 1.0
EXECUTOR_REPORTS = [
    'docs/evidence/NI6/public-preparation-r2-executor-independent-design.md',
    'docs/evidence/NI6/public-preparation-r2-executor-independent-design.json',
    'docs/evidence/NI6/prep01-executor-r3-independent-source-review.md',
    'docs/evidence/NI6/prep01-executor-r3-independent-source-review.json',
    'docs/evidence/NI6/prep01-executor-r3-independent-test-review.md',
    'docs/evidence/NI6/prep01-executor-r3-independent-test-review.json',
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


def latch_interruption(_signum, _frame):
    global STOP_REQUESTED
    STOP_REQUESTED = True  # Repeated catchable signals cannot interrupt cleanup.


def guard(deadline, code='EXECUTOR_AGGREGATE_DEADLINE', *, cleanup=False):
    need(cleanup or not STOP_REQUESTED, 'EXECUTOR_INTERRUPTED')
    need(time.monotonic() < deadline, code)


def strict_json(raw):
    def pairs(items):
        value = {}
        for key, item in items:
            need(key not in value, 'EXECUTOR_DUPLICATE_JSON_MEMBER')
            value[key] = item
        return value
    def constant(_value):
        raise Stop('EXECUTOR_JSON_CONSTANT')
    return json.loads(raw, object_pairs_hook=pairs, parse_constant=constant)


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
    return strict_json(raw)


def owned_directory(path):
    s = path.lstat()
    need(path.resolve() == path and stat.S_ISDIR(s.st_mode) and s.st_uid == os.getuid()
         and stat.S_IMODE(s.st_mode) == 0o700, 'EXECUTOR_PRIVATE_DIRECTORY')


def owned_file(path):
    s = path.lstat()
    need(path.resolve() == path and stat.S_ISREG(s.st_mode) and not path.is_symlink()
         and s.st_uid == os.getuid() and stat.S_IMODE(s.st_mode) == 0o600,
         'EXECUTOR_PRIVATE_FILE')


def private_directory(path):
    path.mkdir(mode=0o700)
    os.chmod(path, 0o700)  # This newly created component only; no ambient parent.
    owned_directory(path)


def copy_parents(base, parent, created):
    owned_directory(base)
    need(parent.is_relative_to(base), 'EXECUTOR_COPY_CONTAINMENT')
    current = base
    for part in parent.relative_to(base).parts:
        current = current / part
        if current not in created:
            private_directory(current)
            created.add(current)
        owned_directory(current)


def exclusive(path):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        os.fchmod(fd, 0o600)
        s = os.fstat(fd)
        need(stat.S_ISREG(s.st_mode) and s.st_uid == os.getuid()
             and stat.S_IMODE(s.st_mode) == 0o600 and path.resolve() == path,
             'EXECUTOR_PRIVATE_FILE')
        return os.fdopen(fd, 'wb')
    except BaseException:
        os.close(fd)
        raise


def save(path, value, *, fresh=False):
    raw = (json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + '\n').encode()
    if fresh:
        with exclusive(path) as handle:
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
    else:
        s = path.lstat()
        need(stat.S_ISREG(s.st_mode) and not path.is_symlink() and s.st_uid == os.getuid()
             and stat.S_IMODE(s.st_mode) == 0o600, 'EXECUTOR_OWNED_RECORD')
        fd = os.open(path, os.O_WRONLY | os.O_TRUNC | os.O_NOFOLLOW)
        with os.fdopen(fd, 'wb') as handle:
            actual = os.fstat(handle.fileno())
            need(actual.st_ino == s.st_ino and actual.st_dev == s.st_dev
                 and actual.st_uid == os.getuid() and stat.S_IMODE(actual.st_mode) == 0o600,
                 'EXECUTOR_OWNED_RECORD')
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())


def verify(pins, graph, deadline):
    checked = 0
    for name, digest in pins.items():
        guard(deadline, 'EXECUTOR_VERIFICATION_DEADLINE')
        need(isinstance(digest, str) and re.fullmatch('[a-f0-9]{64}', digest), 'EXECUTOR_DIGEST')
        need(sha(pin_path(name).read_bytes()) == digest, 'EXECUTOR_PIN_DRIFT')
        guard(deadline, 'EXECUTOR_VERIFICATION_DEADLINE')
        checked += 1
    need(graph['root'] == str(HOST) and len(graph['files']) == 27577
         and len(graph['links']) == 12, 'EXECUTOR_HOST_GRAPH')
    for name, digest in graph['files'].items():
        guard(deadline, 'EXECUTOR_VERIFICATION_DEADLINE')
        path = contained(str(Path('.runtime/dsh-web') / name))
        need(sha(path.read_bytes()) == digest, 'EXECUTOR_HOST_DRIFT')
        guard(deadline, 'EXECUTOR_VERIFICATION_DEADLINE')
    for name, row in graph['links'].items():
        guard(deadline, 'EXECUTOR_VERIFICATION_DEADLINE')
        path = HOST / name
        need(not Path(name).is_absolute() and all(p not in ('', '.', '..') for p in name.split('/'))
             and path.is_symlink() and os.readlink(path) == row['target']
             and str(path.resolve()) == row['resolved'], 'EXECUTOR_HOST_LINK')
    guard(deadline, 'EXECUTOR_VERIFICATION_DEADLINE')
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
    cleanup_end = hard_end - COMMAND_BOOKKEEPING
    work_end = cleanup_end - 4.0
    guard(work_end, 'EXECUTOR_COMMAND_BUDGET')
    paths = {name: private / f'command-{index:02d}.{name}.bin' for name in ('stdout', 'stderr')}
    handles, pipes = {}, []
    row = {'index': index, 'argv': argv, 'startedAt': now(), 'exitCode': None,
           'timedOut': False, 'overflow': False, 'interrupted': False,
           'processGroupState': 'NOT_STARTED', 'signalAttempts': [], 'signalOutcomes': [],
           'failureCode': None, 'captureComplete': False, 'signalBoundary': 'NOT_SELECTED'}
    received = {'stdout': 0, 'stderr': 0}
    stored = {'stdout': 0, 'stderr': 0}
    eof = {'stdout': False, 'stderr': False}
    process, selector = None, selectors.DefaultSelector()
    signalling_blocked, absence_observed = False, False

    def observe_group():
        nonlocal signalling_blocked, absence_observed
        if absence_observed:
            return False  # Never reinterpret a number after observed group absence.
        try:
            state = group_exists(process.pid)
        except OSError:
            state = None
        if state is False:
            absence_observed = True
        elif state is None:
            signalling_blocked = True
            row['signalBoundary'] = 'OWNERSHIP_UNKNOWN'
        return state

    def cleanup():
        nonlocal signalling_blocked, absence_observed
        if process is None:
            return
        if time.monotonic() >= cleanup_end:
            row['processGroupState'] = 'UNKNOWN_OR_REMAINS'
            row['failureCode'] = row['failureCode'] or 'EXECUTOR_CLEANUP_DEADLINE'
            return
        process.poll()  # Only the original owned leader is reaped.
        state = observe_group()
        if state is not False and row['failureCode'] is None:
            row['failureCode'] = 'EXECUTOR_GROUP_REMAINS'
        for sig in (signal.SIGTERM, signal.SIGKILL):
            if signalling_blocked or state is False:
                break
            if time.monotonic() >= cleanup_end:
                break  # Every signal has its own absolute pre-selection check.
            state = observe_group()
            if signalling_blocked or state is not True or time.monotonic() >= cleanup_end:
                break
            if sig.name in row['signalAttempts']:
                continue
            row['signalAttempts'].append(sig.name)
            try:
                os.killpg(process.pid, sig)
                row['signalOutcomes'].append('SUBMITTED')
                row['signalBoundary'] = 'OWNED_SUBMITTED'
            except ProcessLookupError:
                row['signalOutcomes'].append('ALREADY_ABSENT')
                absence_observed = True
                state = False
                break
            except (PermissionError, OSError):
                row['signalOutcomes'].append('DENIED_UNKNOWN')
                row['signalBoundary'] = 'DENIED_UNKNOWN'
                signalling_blocked = True
                break  # No KILL, retry, other target or finalizer signalling follows.
            until = min(time.monotonic() + 2.0, cleanup_end)
            while time.monotonic() < until:
                process.poll()
                state = observe_group()
                if signalling_blocked or state is False:
                    break
                time.sleep(min(0.05, max(0, until - time.monotonic())))
        if time.monotonic() < cleanup_end:
            process.poll()
            state = observe_group()
        else:
            state = False if absence_observed else None
        row['exitCode'] = process.returncode
        row['processGroupState'] = 'ABSENT_OBSERVED' if state is False else 'UNKNOWN_OR_REMAINS'
        if state is not False and row['failureCode'] is None:
            row['failureCode'] = 'EXECUTOR_GROUP_UNKNOWN'

    try:
        for name, path in paths.items():
            guard(work_end, 'EXECUTOR_COMMAND_BUDGET')
            handles[name] = exclusive(path)
        # Admission linearizes at this final observed-stop guard. An observed
        # flag refuses spawn; later stops concern an already admitted child.
        # Python delivery and OS spawn are separate, not instant/atomic cancel.
        guard(work_end, 'EXECUTOR_COMMAND_BUDGET')
        process = subprocess.Popen(argv, cwd=ROOT, stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=False, start_new_session=True)
        row['childPid'] = row['ownedProcessGroup'] = process.pid
        row['processGroupState'] = 'OWNED_NEW_SESSION'
        for name, pipe in (('stdout', process.stdout), ('stderr', process.stderr)):
            os.set_blocking(pipe.fileno(), False)
            selector.register(pipe, selectors.EVENT_READ, name)
            pipes.append(pipe)
        while selector.get_map() or process.poll() is None:
            if STOP_REQUESTED:
                row['interrupted'] = True
                row['failureCode'] = 'EXECUTOR_INTERRUPTED'
                break
            if time.monotonic() >= work_end:
                row['timedOut'] = True
                row['failureCode'] = 'EXECUTOR_COMMAND_TIMEOUT'
                break
            for key, _ in selector.select(timeout=min(0.05, max(0, work_end - time.monotonic()))):
                chunk = os.read(key.fileobj.fileno(), 65536)
                name = key.data
                if not chunk:
                    eof[name] = True
                    selector.unregister(key.fileobj)
                    continue
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
    except (KeyboardInterrupt, InterruptedError):
        latch_interruption(None, None)
        row['interrupted'], row['failureCode'] = True, 'EXECUTOR_INTERRUPTED'
    except Exception as error:
        row['failureCode'] = str(error) if isinstance(error, Stop) else 'EXECUTOR_SPAWN_OR_CAPTURE_FAILED'
    finally:
        if STOP_REQUESTED:
            row['interrupted'], row['failureCode'] = True, 'EXECUTOR_INTERRUPTED'
        try:
            cleanup()  # The sole cleanup path; its denial latch is never reset.
        except Exception:
            signalling_blocked = True
            row['signalBoundary'] = 'OWNERSHIP_UNKNOWN'
            row['processGroupState'] = 'UNKNOWN_OR_REMAINS'
            row['failureCode'] = row['failureCode'] or 'EXECUTOR_CLEANUP_UNKNOWN'
        for closeable in [selector, *pipes, *handles.values()]:
            try:
                closeable.close()
            except Exception:
                row['failureCode'] = row['failureCode'] or 'EXECUTOR_CAPTURE_CLOSE_UNKNOWN'
        row['privateStreams'] = {}
        for name in handles:
            item = {'bytes': stored[name], 'sha256': None, 'prefixVerified': False,
                    'receivedAtLeastBytes': received[name], 'eofObserved': eof[name],
                    'complete': False,
                    'truncated': True if received[name] > stored[name] else (False if eof[name] else 'UNKNOWN')}
            row['privateStreams'][name] = item
            try:
                guard(cleanup_end, 'EXECUTOR_COMMAND_BOOKKEEPING', cleanup=True)
                owned_file(paths[name])
                raw = paths[name].read_bytes()
                need(len(raw) == stored[name], 'EXECUTOR_CAPTURE_READBACK')
                item.update({'bytes':len(raw),'sha256':sha(raw),'prefixVerified':True,
                             'complete':eof[name] and received[name] == stored[name]})
                guard(cleanup_end, 'EXECUTOR_COMMAND_BOOKKEEPING', cleanup=True)
            except Exception as error:
                item['complete'] = False
                row['failureCode'] = row['failureCode'] or (str(error) if isinstance(error,Stop)
                                                            else 'EXECUTOR_CAPTURE_READBACK_UNKNOWN')
        row['captureComplete'] = (len(row['privateStreams']) == 2 and not row['overflow']
                                  and all(item['complete'] for item in row['privateStreams'].values()))
        row['captureTerminationReason'] = row['failureCode'] or ('EOF_OBSERVED' if row['captureComplete'] else 'EOF_UNKNOWN')
        row['remoteTermination'], row['reservationRelease'] = 'NOT_CLAIMED', 'NOT_CLAIMED'
    if not row['captureComplete'] and row['failureCode'] is None:
        row['failureCode'] = 'EXECUTOR_CAPTURE_INCOMPLETE'
    if row['exitCode'] != 0 and row['failureCode'] is None:
        row['failureCode'] = 'EXECUTOR_COMMAND_NONZERO'
    row['finishedAt'] = now()
    row['durationSeconds'] = round(time.monotonic() - started, 6)
    if time.monotonic() >= cleanup_end:
        row['failureCode'] = row['failureCode'] or 'EXECUTOR_COMMAND_BOOKKEEPING'
    return row, paths, started, hard_end


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
    identity = 'df.ni6-prep01-public-result/v1'
    def contains_identity(value):
        if isinstance(value, dict):
            return value.get('contractVersion') == identity or any(contains_identity(v) for v in value.values())
        if isinstance(value, list):
            return any(contains_identity(v) for v in value)
        return False
    selected = []
    for line in paths['stdout'].read_bytes().splitlines():
        comment = line.lstrip()
        if not comment.startswith(b'#'):
            continue
        raw = comment[1:].strip()
        # Parse JSON-looking diagnostics regardless of ordering/spacing/escapes.
        # Unknown ordinary text stays private; ambiguous JSON never supplies PASS.
        if raw[:1] not in (b'{', b'['):
            need(identity.encode('ascii') not in raw, 'EXECUTOR_DIAGNOSTIC_MALFORMED')
            try:
                text = raw.decode('utf-8')
            except UnicodeError:
                text = ''  # Unrelated raw text remains private.
            for token in re.finditer(r'"(?:[^"\\]|\\.)*"', text):
                try:
                    hint = strict_json(token.group())
                except (ValueError,Stop):
                    continue
                need(hint != identity, 'EXECUTOR_DIAGNOSTIC_MALFORMED')
            continue
        need(len(raw) <= 8192, 'EXECUTOR_DIAGNOSTIC_BOUND')
        value = strict_json(raw.decode('utf-8'))
        if not contains_identity(value):
            continue
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
    phase_started = time.monotonic()  # Includes the entire early admission interval.
    need(len(sys.argv) == 4 and sys.argv[1] == '--phase' and sys.argv[2] in ('build', 'test'), 'EXECUTOR_ARGUMENTS')
    phase = sys.argv[2]
    plan_name = '.runtime/root-ni6-public-preparation-r3-' + ('build-plan.json' if phase == 'build' else 'execution-plan.json')
    need(sys.argv[3] == plan_name and Path.cwd() == ROOT and ROOT.resolve() == ROOT
         and Path(__file__).resolve() == OWN / 'runner.py', 'EXECUTOR_IDENTITY')
    owned_directory(OWN)
    marker_path = OWN / (phase + '-invocation.json')
    marker = {'contractVersion':'df.ni6-prep01-executor-invocation/v1','phase':phase,
              'state':'IN_PROGRESS','finalized':False,'startedAt':now()}
    # Exclusive consumption precedes environment, plan, proposal and pin validation.
    # Never delete/reset this marker; interruption before finalization stays consumed.
    save(marker_path, marker, fresh=True)
    deadline, spent_before = phase_started + ACTIVE_CAP, 0.0
    evidence, private, ledger = None, None, None
    evidence_owned, private_owned, ledger_owned = False, False, False
    ledger_path = OWN / 'wave-ledger.json'
    rows, commands, complete, finalized, final_code = [], [], False, False, None
    after_complete = False

    def evidence_directory():
        need(evidence_owned and evidence is not None,'EXECUTOR_EVIDENCE_NOT_OWNED')
        owned_directory(evidence)
        return evidence

    def ledger_record():
        need(ledger_owned and ledger is not None,'EXECUTOR_LEDGER_NOT_OWNED')
        owned_file(ledger_path)
        return ledger_path

    try:
        signal.signal(signal.SIGTERM, latch_interruption)
        signal.signal(signal.SIGINT, latch_interruption)
        guard(deadline - PHASE_BOOKKEEPING)
        evidence_name = 'docs/evidence/NI6/public-preparation-r3-' + ('build' if phase == 'build' else 'execution')
        proposed_evidence = contained(evidence_name, absent=True)
        proposed_private = OWN / ('private-' + phase)
        # A refused existing path never becomes a write/read/finalizer target.
        private_directory(proposed_evidence)
        evidence, evidence_owned = proposed_evidence, True
        private_directory(proposed_private)
        private, private_owned = proposed_private, True
        if phase == 'build':
            need(not ledger_path.exists() and not (OWN / 'test-invocation.json').exists(), 'EXECUTOR_BUILD_ALREADY_CONSUMED')
            proposed_ledger = {'contractVersion':'df.ni6-prep01-executor-ledger/v1','sourceManifestSha256':None,
                      'activeSeconds':0.0,'build':'IN_PROGRESS','buildFinalized':False,
                      'test':'UNCONSUMED','testFinalized':False,'phases':[]}
            save(ledger_path, proposed_ledger, fresh=True)
            owned_file(ledger_path)
            ledger, ledger_owned = proposed_ledger, True
        else:
            build_marker_path = OWN / 'build-invocation.json'
            build_result_path = contained('docs/evidence/NI6/public-preparation-r3-build/root-phase-result.json')
            for record_path in (ledger_path,build_marker_path,build_result_path):
                owned_file(record_path)
            prior = read_json(ledger_path,65536)
            build_marker = read_json(build_marker_path,65536)
            build_result = read_json(build_result_path,65536)
            need(prior['contractVersion'] == 'df.ni6-prep01-executor-ledger/v1'
                 and prior['build'] == 'PASS' and prior['buildFinalized'] is True
                 and prior['test'] == 'UNCONSUMED' and prior['testFinalized'] is False
                 and build_marker['phase'] == 'build' and build_marker['state'] == 'PASS'
                 and build_marker['finalized'] is True and build_result['result'] == 'PASS'
                 and build_result['finalized'] is True and build_result['failureCode'] is None,
                 'EXECUTOR_PHASE_ORDER')
            need(type(prior['activeSeconds']) in (int,float) and 0 <= prior['activeSeconds'] < ACTIVE_CAP
                 and build_marker['sourceManifestSha256'] == prior['sourceManifestSha256']
                 and build_result['aggregateActiveSeconds'] == prior['activeSeconds'], 'EXECUTOR_PHASE_ACCOUNTING')
            ledger, ledger_owned = prior, True
            spent_before = ledger['activeSeconds']
            deadline = phase_started + ACTIVE_CAP - spent_before
            ledger['test'], ledger['testFinalized'] = 'IN_PROGRESS', False
            save(ledger_record(),ledger)
        guard(deadline - PHASE_BOOKKEEPING)
        need(str(Path(sys.executable).resolve()) == PYTHON_REAL, 'EXECUTOR_PYTHON')
        need(not any(name in os.environ for name in ENV_ABSENT), 'EXECUTOR_ENVIRONMENT')
        need(str(Path(NODE).resolve()) == NODE_REAL and str(Path(PYTHON).resolve()) == PYTHON_REAL, 'EXECUTOR_CANONICAL_BINARIES')
        plan_path = contained(plan_name)
        plan = read_json(plan_path)
        guard(deadline - PHASE_BOOKKEEPING)
        go_key = 'rootReviewedBuildGO' if phase == 'build' else 'rootReviewedExecutionGO'
        need(plan[go_key] is True and plan['runCountAuthorized'] == 1 and plan['all87'] == 'HOLD'
             and plan['CODE'] == 'BLOCKED_UNCHANGED' and plan['accepted'] == 0,
             'EXECUTOR_GO')
        need(plan['runner'] == str((OWN / 'runner.py').relative_to(ROOT)), 'EXECUTOR_RUNNER_SELECTION')
        manifest_name = str(CAPSULE.relative_to(ROOT)) + '/source-manifest.json'
        manifest = read_json(contained(manifest_name))
        proposal_name = str(CAPSULE.relative_to(ROOT)) + ('/build-plan.proposed.json' if phase == 'build' else '/test-plan.proposed.json')
        proposal = read_json(contained(proposal_name))
        guard(deadline - PHASE_BOOKKEEPING)
        commands = exact_commands(phase,proposal)
        need(plan['commands'] == commands and plan['publicGraphManifest'] == GRAPH_NAME
             and plan['evidenceDirectory'] == evidence_name, 'EXECUTOR_PLAN_SELECTION')
        pins, required = dict(plan['pins']), set()
        records = manifest['ownedFiles'] + manifest['inputFiles']
        executor_manifest_name = str((OWN / 'source-manifest.json').relative_to(ROOT))
        executor_manifest = read_json(contained(executor_manifest_name))
        for record in records + executor_manifest['ownedFiles'] + executor_manifest['inputFiles']:
            guard(deadline - PHASE_BOOKKEEPING)
            name = record['path']
            raw = pin_path(name).read_bytes()
            need(len(raw) == record['bytes'] and sha(raw) == record['sha256'], 'EXECUTOR_MANIFEST_DRIFT')
            need(pins.get(name) == record['sha256'], 'EXECUTOR_COMPLETE_MANIFEST_PINS')
            required.add(name)
            guard(deadline - PHASE_BOOKKEEPING)
        need(len({r['path'] for r in records}) == len(records), 'EXECUTOR_DUPLICATE_MANIFEST_PIN')
        required.update([manifest_name,proposal_name,GRAPH_NAME,AC_NAME,DIAGNOSTIC_NAME,REMEDIATION_NAME,
                         OWNERSHIP_NAME,SELECTION_NAME,
                         str((OWN / 'runner.py').relative_to(ROOT)),executor_manifest_name])
        required.update(manifest['requiredAffectedReviews'])
        required.update(manifest['requiredRootGoPins'])
        required.update(EXECUTOR_REPORTS)
        if phase == 'test':
            required.update(str(CAPSULE.relative_to(ROOT)) + '/' + name for name in (
                'package/lib/client.js','package/native-source-manifest.json','build-attempt.json','build-readback.json'))
            required.add('docs/evidence/NI6/public-preparation-r3-build/command-results.json')
        need(required == set(pins), 'EXECUTOR_PIN_SET')
        need(pins[AC_NAME] == AC_HASH and pins[REMEDIATION_NAME] == REMEDIATION_HASH
             and pins[OWNERSHIP_NAME] == OWNERSHIP_HASH and pins[SELECTION_NAME] == SELECTION_HASH
             and all(pins.get(name) == digest for name,digest in BINARY_HASHES.items()), 'EXECUTOR_FROZEN_BASELINE')
        if phase == 'build':
            ledger['sourceManifestSha256'] = pins[manifest_name]
        else:
            need(ledger['sourceManifestSha256'] == pins[manifest_name], 'EXECUTOR_BUILD_SOURCE_BINDING')
        marker['sourceManifestSha256'] = pins[manifest_name]
        save(marker_path,marker)
        pins[plan_name] = sha(plan_path.read_bytes())
        graph = read_json(contained(GRAPH_NAME))
        guard(deadline - PHASE_BOOKKEEPING)
        freeze = dict(plan)
        freeze.update({'executorContract':'df.ni6-prep01-executor/v1','phase':phase,'createdAt':now(),'pins':pins,
                       'activeBudgetSecondsBefore':spent_before,'commandCapSeconds':COMMAND_CAP,
                       'activeAggregateCapSeconds':ACTIVE_CAP,'streamCapBytes':STREAM_CAP,
                       'combinedStreamCapBytes':AGGREGATE_CAP,'rawStreams':'PRIVATE_NOT_COPIED','noRetry':True})
        save(evidence_directory() / 'root-execution-freeze.json',freeze,fresh=True)
        before = verify(pins,graph,deadline - PHASE_BOOKKEEPING)
        save(evidence_directory() / 'root-before-verification.json',before,fresh=True)
        guard(deadline - PHASE_BOOKKEEPING)
        allowed_copies = {r['path'] for r in manifest['ownedFiles']}
        allowed_copies.update(required - {r['path'] for r in manifest['inputFiles']})
        created = set()
        need(isinstance(plan['sourceCopies'],list) and len(plan['sourceCopies']) == len(set(plan['sourceCopies'])), 'EXECUTOR_SOURCE_COPY_SET')
        for name in plan['sourceCopies']:
            guard(deadline - PHASE_BOOKKEEPING,'EXECUTOR_COPY_DEADLINE')
            need(name in allowed_copies and name in pins and not name.startswith('/')
                 and '/private-runtime/' not in name and '/private-' not in name, 'EXECUTOR_SOURCE_COPY')
            target = evidence_directory() / 'frozen-source' / name.removeprefix('.runtime/')
            copy_parents(evidence_directory(),target.parent,created)
            raw = pin_path(name).read_bytes()
            need(sha(raw) == pins[name], 'EXECUTOR_COPY_PIN_DRIFT')
            with exclusive(target) as handle:
                handle.write(raw)
            guard(deadline - PHASE_BOOKKEEPING,'EXECUTOR_COPY_DEADLINE')
        for index,argv in enumerate(commands,1):
            guard(deadline - PHASE_BOOKKEEPING - 5.0)
            need(private_owned and private is not None,'EXECUTOR_PRIVATE_NOT_OWNED')
            owned_directory(private)
            row,paths,command_started,command_end = run_command(argv,index,private,deadline - PHASE_BOOKKEEPING)
            rows.append(row)  # Preserve the observed row even if later parsing fails.
            if '--test' in argv and row['failureCode'] is None:
                try:
                    guard(command_end - COMMAND_BOOKKEEPING,'EXECUTOR_COMMAND_BOOKKEEPING')
                    row['tapCounts'] = safe_tap(paths)
                    count = 31 if argv[-1].endswith('/fixture-oracles.test.mjs') else 1
                    need(row['tapCounts'] == {'tests':count,'suites':0,'pass':count,'fail':0,
                                             'cancelled':0,'skipped':0,'todo':0}, 'EXECUTOR_EXACT_TAP_COUNTS')
                    if argv[-1].endswith('/public-preparation.test.mjs'):
                        row['publicDiagnostic'] = safe_functional(paths)
                    guard(command_end - COMMAND_BOOKKEEPING,'EXECUTOR_COMMAND_BOOKKEEPING')
                except Exception as error:
                    row['failureCode'] = str(error) if isinstance(error,Stop) else 'EXECUTOR_OUTPUT_REJECTED'
            sampled = time.monotonic()
            row['observedWorkSeconds'] = sampled - command_started
            row['durationSeconds'] = row['observedWorkSeconds'] + COMMAND_BOOKKEEPING
            row['conservativeBookkeepingSeconds'] = COMMAND_BOOKKEEPING
            guard(command_end,'EXECUTOR_COMMAND_BOOKKEEPING',cleanup=True)
            need(sampled + COMMAND_BOOKKEEPING <= command_end,'EXECUTOR_COMMAND_BOOKKEEPING')
            failed = row['failureCode'] is not None or STOP_REQUESTED
            if STOP_REQUESTED:
                row['failureCode'] = 'EXECUTOR_INTERRUPTED'
            save(evidence_directory() / 'command-results.json',{'commands':rows,'executionEvidenceOnly':True,
                 'stoppedAfterFirstFailure':failed,'remainingCommandsNotRun':commands[index:] if failed else [],
                 'all87':'HOLD','CODE':'BLOCKED_UNCHANGED'},fresh=index == 1)
            print(json.dumps({'phase':phase,'index':index,'exitCode':row['exitCode'],
                  'failureCode':row['failureCode'],'seconds':row['durationSeconds']}),flush=True)
            need(time.monotonic() <= sampled + COMMAND_BOOKKEEPING,'EXECUTOR_COMMAND_BOOKKEEPING_OVERRUN')
            guard(command_end,'EXECUTOR_COMMAND_BOOKKEEPING')
            if failed:
                final_code = row['failureCode']
                break
        after = verify(pins,graph,deadline - PHASE_BOOKKEEPING)
        save(evidence_directory() / 'root-after-verification.json',after,fresh=True)
        guard(deadline - PHASE_BOOKKEEPING)
        after_complete = True
        complete = (len(rows) == len(commands) and all(r['failureCode'] is None
                    and r['captureComplete'] and r['processGroupState'] == 'ABSENT_OBSERVED' for r in rows))
    except (KeyboardInterrupt,InterruptedError):
        latch_interruption(None,None)
        final_code = 'EXECUTOR_INTERRUPTED'
    except Exception as error:
        final_code = str(error) if isinstance(error,Stop) else 'EXECUTOR_PHASE_FAILED'
    finally:
        # Five seconds are charged once for all terminal persistence, not added to
        # command charges. Command bookkeeping already belongs to observed phase work.
        sampled = time.monotonic()
        observed_work = sampled - phase_started
        charged = observed_work + PHASE_BOOKKEEPING
        terminal_end = min(sampled + PHASE_BOOKKEEPING,deadline)
        candidate = (complete and after_complete and final_code is None and not STOP_REQUESTED
                     and evidence_owned and private_owned and ledger_owned and ledger is not None)
        if not candidate and final_code is None:
            final_code = 'EXECUTOR_PHASE_INCOMPLETE'
        if spent_before + charged > ACTIVE_CAP:
            candidate,final_code = False,'EXECUTOR_AGGREGATE_DEADLINE'
        phase_result = {'phase':phase,'result':'FINALIZING' if candidate else 'FAILED_HOLD','finalized':False,
            'failureCode':final_code,'observedWorkSeconds':observed_work,'conservativePhaseChargeSeconds':charged,
            'terminalBookkeepingSeconds':PHASE_BOOKKEEPING,'aggregateActiveSeconds':spent_before + charged,
            'commandsObserved':len(rows),'commandObservationComplete':complete,'afterVerificationComplete':after_complete,
            'observedTerminalOverrun':False,
            'all87':'HOLD','CODE':'BLOCKED_UNCHANGED','accepted':0,
            'nativeTermination':'NOT_CLAIMED','reservationRelease':'NOT_CLAIMED'}
        marker.update({'state':phase_result['result'],'finalized':False,'failureCode':final_code,
                       'conservativePhaseChargeSeconds':charged})
        def terminal_save(path,value,*,fresh=False,end=terminal_end):
            guard(end,'EXECUTOR_PHASE_BOOKKEEPING',cleanup=True)
            save(path,value,fresh=fresh)
            guard(end,'EXECUTOR_PHASE_BOOKKEEPING',cleanup=True)

        try:
            terminal_save(marker_path,marker)
            if evidence_owned:
                if not after_complete and not (evidence_directory() / 'root-after-verification.json').exists():
                    terminal_save(evidence_directory() / 'root-after-verification.json',{'checkedAt':now(),'complete':False,
                         'unchanged':'UNKNOWN','failureCode':final_code,'noAcceptancePromotion':True},fresh=True)
                terminal_save(evidence_directory() / 'root-phase-result.json',phase_result,fresh=True)
            if ledger_owned:
                ledger['activeSeconds'] = spent_before + charged
                ledger[phase],ledger[phase + 'Finalized'] = phase_result['result'],False
                ledger['phases'].append({'phase':phase,'observedWorkSeconds':observed_work,
                     'conservativePhaseChargeSeconds':charged,'commandsObserved':len(rows),'result':phase_result['result']})
                terminal_save(ledger_record(),ledger)
            need(not STOP_REQUESTED,'EXECUTOR_INTERRUPTED')
            if candidate:
                # Leave the last second of the same five-second phase reserve for
                # bounded invalidation. It is not an additional time allowance.
                commit_end = terminal_end - 1.0
                phase_result.update({'result':'PASS','finalized':True})
                terminal_save(evidence_directory() / 'root-phase-result.json',phase_result,end=commit_end)
                need(not STOP_REQUESTED,'EXECUTOR_INTERRUPTED')
                ledger[phase],ledger[phase + 'Finalized'] = 'PASS',True
                ledger['phases'][-1]['result'] = 'PASS'
                terminal_save(ledger_record(),ledger,end=commit_end)
                need(not STOP_REQUESTED,'EXECUTOR_INTERRUPTED')
                # The invocation remains nonfinal until all other records/checks.
                marker.update({'state':'PASS','finalized':True})
                terminal_save(marker_path,marker,end=commit_end)
                need(not STOP_REQUESTED,'EXECUTOR_INTERRUPTED')
                # Completion linearizes at that last successful postwrite/stop
                # check. Persisted PASS alone cannot prove the driver returned.
                finalized = True
        except (Exception,KeyboardInterrupt) as error:
            finalized = False
            final_code = str(error) if isinstance(error,Stop) else 'EXECUTOR_TERMINAL_PERSISTENCE_UNKNOWN'
            overrun = time.monotonic() >= terminal_end
            marker.update({'state':'FAILED_HOLD','finalized':False,'failureCode':final_code,
                           'observedTerminalOverrun':overrun})
            phase_result.update({'result':'FAILED_HOLD','finalized':False,'failureCode':final_code,
                                 'observedTerminalOverrun':overrun})
            # Invalidate the admission latch first, within the original reserve.
            # Do not select late I/O when uninterruptible work returned over budget.
            # Such an unknown/failed driver return forbids root's test-phase GO;
            # persisted records alone cannot certify that OS-boundary outcome.
            try:
                terminal_save(marker_path,marker)
                if ledger_owned:
                    ledger[phase],ledger[phase + 'Finalized'] = 'FAILED_HOLD',False
                    terminal_save(ledger_record(),ledger)
                if evidence_owned and (evidence_directory() / 'root-phase-result.json').exists():
                    terminal_save(evidence_directory() / 'root-phase-result.json',phase_result)
            except (Exception,KeyboardInterrupt):
                pass  # Consumed/incomplete or failed driver; no retry/advancement.
            print('EXECUTOR_PHASE_BOOKKEEPING_OVERRUN' if overrun else final_code,file=sys.stderr)
    # Recheck the observed flag conservatively; root also needs this real return.
    return 0 if finalized and not STOP_REQUESTED else 1


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (Exception,KeyboardInterrupt) as error:
        code = str(error) if isinstance(error,Stop) else 'EXECUTOR_ADMISSION_FAILED'
        print(code if re.fullmatch(r'EXECUTOR_[A-Z0-9_]+',code) else 'EXECUTOR_ADMISSION_FAILED',file=sys.stderr)
        sys.exit(1)
