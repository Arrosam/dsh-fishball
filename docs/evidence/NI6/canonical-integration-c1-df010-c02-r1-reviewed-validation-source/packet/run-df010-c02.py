"""Source-only C1DF010-C02-r1: one fixed original Node test command; root GO required."""
import time
STARTED = time.monotonic()
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

ROOT=Path('/Users/samuel/Documents/Codex/2026-10-04/task-6/dsh-fishball')
NAME='.runtime/ni6-canonical-integration-c1/validation/df010-c02-r1'
CAPSULE=ROOT/NAME
HOST=ROOT/'.runtime/dsh-web'
NODE='/opt/homebrew/opt/node@22/bin/node'
PYTHON='/opt/homebrew/bin/python3'
NODE_REAL='/opt/homebrew/Cellar/node@22/22.22.2_1/bin/node'
PYTHON_REAL='/opt/homebrew/Cellar/python@3.14/3.14.5/Frameworks/Python.framework/Versions/3.14/bin/python3.14'
BINARY_HASHES={NODE_REAL:'463b47d6e984e4f84cd2421dabf5081414e40ab9d967e828b2db7858e707f6de',
 PYTHON_REAL:'2477b47fa3ae65b9574eb18a15edb364e96948eaa1875ad3f1c80d780efc9c12'}
PLAN_NAME='.runtime/root-ni6-canonical-integration-c1-df010-c02-r1-plan.json'
GRAPH_NAME='.runtime/ni3-native-runtime/public-graph-pins.json'
STOP_REQUESTED=False
FIRST_REASON=None
COMMAND_BOOKKEEPING=1.0
STREAM_CAP=131072
AGGREGATE_CAP=262144
PUBLIC_RECORD_CAP=65536
sha=lambda b:hashlib.sha256(b).hexdigest()
now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()


class Stop(Exception):
    pass


def need(condition, code):
    global FIRST_REASON
    if not condition:
        FIRST_REASON = FIRST_REASON or code
        raise Stop()


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
        need(False, 'EXECUTOR_JSON_CONSTANT')
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
    return s


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
        need(identity(path) == (s.st_dev,s.st_ino), 'EXECUTOR_FILE_IDENTITY')
        return os.fdopen(fd, 'wb')
    except BaseException:
        os.close(fd)
        raise


def owned_handle(path, handle, expected_identity=None):
    actual = os.fstat(handle.fileno())
    observed = owned_file(path)
    stamp = (actual.st_dev,actual.st_ino)
    need(stat.S_ISREG(actual.st_mode) and actual.st_uid == os.getuid()
         and stat.S_IMODE(actual.st_mode) == 0o600
         and stamp == (observed.st_dev,observed.st_ino)
         and (expected_identity is None or stamp == expected_identity), 'EXECUTOR_FILE_IDENTITY')
    return stamp


def bounded_owned_bytes(path, maximum, *, expected_length=None, expected_identity=None):
    observed = owned_file(path)
    stamp = (observed.st_dev,observed.st_ino)
    need(0 <= observed.st_size <= maximum
         and (expected_length is None or observed.st_size == expected_length), 'EXECUTOR_OWNED_READ_BOUND')
    need(expected_identity is None or stamp == expected_identity, 'EXECUTOR_FILE_IDENTITY')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, 'rb') as handle:
        owned_handle(path,handle,stamp)
        need(os.fstat(handle.fileno()).st_size == observed.st_size, 'EXECUTOR_OWNED_READ_BOUND')
        raw = handle.read(maximum + 1)
        owned_handle(path,handle,stamp)
        need(os.fstat(handle.fileno()).st_size == observed.st_size
             and len(raw) == observed.st_size and len(raw) <= maximum, 'EXECUTOR_OWNED_READ_BOUND')
    return raw


def save(path, value, *, fresh=False, expected_identity=None):
    raw = (json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + '\n').encode()
    need(len(raw) <= PUBLIC_RECORD_CAP, 'EXECUTOR_RECORD_BOUND')
    if fresh:
        with exclusive(path) as handle:
            stamp = owned_handle(path,handle)
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
            owned_handle(path,handle,stamp)
            return stamp
    else:
        s = path.lstat()
        need(stat.S_ISREG(s.st_mode) and not path.is_symlink() and s.st_uid == os.getuid()
             and stat.S_IMODE(s.st_mode) == 0o600, 'EXECUTOR_OWNED_RECORD')
        need(expected_identity is None or (s.st_dev,s.st_ino) == expected_identity, 'EXECUTOR_OWNED_RECORD')
        fd = os.open(path, os.O_WRONLY | os.O_NOFOLLOW)
        with os.fdopen(fd, 'wb') as handle:
            actual = os.fstat(handle.fileno())
            need(actual.st_ino == s.st_ino and actual.st_dev == s.st_dev
                 and actual.st_uid == os.getuid() and stat.S_IMODE(actual.st_mode) == 0o600,
                 'EXECUTOR_OWNED_RECORD')
            stamp = owned_handle(path,handle,expected_identity)
            os.ftruncate(handle.fileno(),0)
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
            owned_handle(path,handle,stamp)
            return stamp


def identity(path):
    s = path.lstat()
    return (s.st_dev,s.st_ino)


def verify(pins, deadline):
    for name,digest in pins.items():
        guard(deadline)
        need(type(digest) is str and re.fullmatch('[a-f0-9]{64}',digest),'EXECUTOR_DIGEST')
        need(sha(pin_path(name).read_bytes())==digest,'EXECUTOR_PIN_DRIFT')
        guard(deadline)
    return {'inputCount':len(pins),'complete':True,'unchanged':True}


def group_exists(pgid):
    try:
        os.killpg(pgid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return None


def run_command(argv, index, private, deadline, cap, cleanup_seconds, environment):
    started = time.monotonic()
    hard_end = min(started + cap, deadline)
    cleanup_end = hard_end - COMMAND_BOOKKEEPING
    work_end = cleanup_end - cleanup_seconds
    guard(work_end, 'EXECUTOR_COMMAND_BUDGET')
    owned_directory(private)
    paths = {name: private / f'command-{index:02d}.{name}.bin' for name in ('stdout', 'stderr')}
    handles, pipes = {}, []
    row = {'index': index, 'argv': argv, 'startedAt': now(), 'exitCode': None,
           'timedOut': False, 'overflow': False, 'interrupted': False,
           'processGroupState': 'NOT_STARTED', 'signalAttempts': [], 'signalOutcomes': [],
           'failureCode': None, 'captureComplete': False, 'signalBoundary': 'NOT_SELECTED'}
    received = {'stdout': 0, 'stderr': 0}
    stored = {'stdout': 0, 'stderr': 0}
    eof = {'stdout': False, 'stderr': False}
    prefix_hashes = {name:hashlib.sha256() for name in ('stdout','stderr')}
    capture_identities = {}
    verified_stdout = None
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
            capture_identities[name] = owned_handle(path,handles[name])
        # Admission linearizes at this final observed-stop guard. An observed
        # flag refuses spawn; later stops concern an already admitted child.
        # Python delivery and OS spawn are separate, not instant/atomic cancel.
        guard(work_end, 'EXECUTOR_COMMAND_BUDGET')
        process = subprocess.Popen(argv, cwd=ROOT, stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=False, start_new_session=True, env=environment)
        row['childPid'] = row['ownedProcessGroup'] = process.pid
        row['processGroupState'] = 'OWNED_NEW_SESSION'
        for name, pipe in (('stdout', process.stdout), ('stderr', process.stderr)):
            os.set_blocking(pipe.fileno(), False)
            selector.register(pipe, selectors.EVENT_READ, name)
            pipes.append(pipe)
        while selector.get_map() or process.poll() is None:
            if STOP_REQUESTED:
                row['interrupted'] = True
                row['failureCode'] = row['failureCode'] or 'EXECUTOR_INTERRUPTED'
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
                    owned_handle(paths[name],handles[name],capture_identities[name])
                    handles[name].write(chunk[:amount])
                    prefix_hashes[name].update(chunk[:amount])
                    stored[name] += amount
                if amount < len(chunk):
                    row['overflow'] = True
                    row['failureCode'] = 'EXECUTOR_OUTPUT_BOUND'
                    break
            if row['overflow']:
                break
    except (KeyboardInterrupt, InterruptedError):
        latch_interruption(None, None)
        row['interrupted'], row['failureCode'] = True, row['failureCode'] or 'EXECUTOR_INTERRUPTED'
    except Exception as error:
        row['failureCode'] = FIRST_REASON if isinstance(error, Stop) else 'EXECUTOR_SPAWN_OR_CAPTURE_FAILED'
    finally:
        if STOP_REQUESTED:
            row['interrupted'], row['failureCode'] = True, row['failureCode'] or 'EXECUTOR_INTERRUPTED'
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
                need(stored[name] <= STREAM_CAP, 'EXECUTOR_CAPTURE_READBACK')
                raw = bounded_owned_bytes(paths[name],stored[name],expected_length=stored[name],
                                          expected_identity=capture_identities[name])
                need(len(raw) == stored[name] and sha(raw) == prefix_hashes[name].hexdigest(), 'EXECUTOR_CAPTURE_READBACK')
                if name == 'stdout': verified_stdout = raw  # Original identity-bound readback retained only in owner memory.
                item.update({'bytes':len(raw),'sha256':sha(raw),'prefixVerified':True,
                             'complete':eof[name] and received[name] == stored[name]})
                guard(cleanup_end, 'EXECUTOR_COMMAND_BOOKKEEPING', cleanup=True)
            except Exception as error:
                item['complete'] = False
                row['failureCode'] = row['failureCode'] or (FIRST_REASON if isinstance(error,Stop)
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
    return row, paths, started, hard_end, verified_stdout

def tap_footer(raw):
    # Only this owning executor reads its fresh, complete bounded stdout.
    # Interior test names/errors/payloads remain opaque and never enter records.
    names = (b'tests', b'suites', b'pass', b'fail', b'cancelled', b'skipped', b'todo', b'duration_ms')
    observed = {name: [] for name in names}
    for line in raw.splitlines():
        for name in names:
            if line.startswith(b'# ' + name) and (len(line) == len(name) + 2 or line[len(name) + 2:len(name) + 3] in (b' ', b'\t')):
                observed[name].append(line)
    need(all(len(observed[name]) == 1 for name in names), 'EXECUTOR_TAP_FOOTER_FIELDS')
    lines = raw.splitlines()
    need(len(lines) >= 9 and raw.endswith(b'\n'), 'EXECUTOR_TAP_FOOTER_MISSING')
    footer = lines[-9:]
    need(re.fullmatch(rb'1\.\.[1-9][0-9]{0,15}', footer[0]) is not None, 'EXECUTOR_TAP_PLAN')
    totals = {}
    for index, name in enumerate(names[:-1], 1):
        matched = re.fullmatch(rb'# ' + name + rb' (0|[1-9][0-9]{0,15})', footer[index])
        need(matched is not None and observed[name][0] == footer[index], 'EXECUTOR_TAP_TOTAL')
        totals[name.decode('ascii')] = int(matched.group(1))
    duration = re.fullmatch(rb'# duration_ms (0|[1-9][0-9]{0,15})(\.[0-9]{1,16})?', footer[8])
    need(duration is not None and observed[b'duration_ms'][0] == footer[8], 'EXECUTOR_TAP_DURATION')
    need(totals['tests'] > 0 and totals['pass'] == totals['tests']
         and all(totals[name] == 0 for name in ('fail', 'cancelled', 'skipped', 'todo')), 'EXECUTOR_TAP_NOT_PASS')
    totals['durationMs'] = footer[8][14:].decode('ascii')
    return totals


def build_authority(manifest):
    proof = read_json(contained(manifest['actualBuildReturn']), 16384)
    need(proof.get('schema') == 'df.canonical-c1.build-actual-return/v1'
         and proof.get('result') == 'PASS' and proof.get('actualBuildCommands') == 4,
         'EXECUTOR_BUILD_AUTHORITY')
    direct = proof.get('directDriverReturn', {})
    need(direct.get('exitCode') == 0 and direct.get('outputBytes') == 0 and direct.get('complete') is True
         and isinstance(direct.get('originalToolReturns'), list) and len(direct['originalToolReturns']) > 0,
         'EXECUTOR_BUILD_DRIVER_RETURN')
    need(proof.get('generated') == manifest['buildGenerated'] and proof.get('recordPins') == manifest['buildRecords']
         and proof.get('rootPlan') == manifest['buildRootPlan'], 'EXECUTOR_BUILD_PIN_SET')


def main():
    global FIRST_REASON
    end = STARTED + 90; work_end = STARTED + 85
    marker = CAPSULE / 'invocation.json'; private = CAPSULE / 'private-capture'; evidence = CAPSULE / 'execution'
    marker_owned = evidence_owned = False; marker_id = evidence_id = None
    rows = []; before = after = footer = None; finalized = False
    record = {'contractVersion': 'df.canonical-c1.df010-c02-r1/v1', 'result': 'FAILED_HOLD', 'failureCode': None,
              'commands': rows, 'tapFooter': None, 'before': None, 'after': None, 'directDriverReturnRequired': True,
              'rawTestContentPublished': False, 'selectedTestFiles': 1, 'maximumInterpreterStarts': 3,
              'maximumConcurrentInterpreters': 3, 'maximumConcurrentNestedChildren': 0, 'maximumNestedInterpreterStarts': 0,
              'interpreterCountAuthority': 'SOURCE_DERIVED_MAXIMUM_NOT_CHILD_INSTRUMENTATION',
              'fullAcceptance': False, 'DF010C02ChangedThreadReordering': 'SELECTED_SYNTHETIC_ASSERTIONS_ONLY'}
    try:
        need(len(sys.argv) == 2 and sys.argv[1] == PLAN_NAME and Path.cwd() == ROOT
             and Path(__file__).resolve() == CAPSULE / 'run-df010-c02.py', 'EXECUTOR_IDENTITY')
        owned_directory(CAPSULE); marker_id = save(marker, {'state': 'IN_PROGRESS'}, fresh=True); marker_owned = True
        proposal = read_json(CAPSULE / 'execution-plan.proposed.json'); manifest = read_json(CAPSULE / 'source-manifest.json')
        plan_path = contained(PLAN_NAME); owned_file(plan_path); plan_raw = plan_path.read_bytes()
        need(len(plan_raw) <= PUBLIC_RECORD_CAP, 'EXECUTOR_PLAN_BOUND'); plan_digest = sha(plan_raw); plan = strict_json(plan_raw)
        need(set(plan) == set(proposal), 'EXECUTOR_PLAN_FIELDS')
        for key in proposal:
            if key not in ('rootReviewedExecutionGO', 'rootSupportedExecutionApprovalGranted', 'rootReviewedFinalAffectedReports', 'pins'):
                need(plan[key] == proposal[key], 'EXECUTOR_PLAN_SELECTION')
        need(all(plan[key] is True for key in ('rootReviewedExecutionGO', 'rootSupportedExecutionApprovalGranted', 'rootReviewedFinalAffectedReports')), 'EXECUTOR_ROOT_GO')
        need(plan['runCountAuthorized'] == 1 and plan['runner'] == NAME + '/run-df010-c02.py', 'EXECUTOR_ONCE')
        for key in manifest['environmentMustBeAbsent']: need(key not in os.environ, 'EXECUTOR_ENVIRONMENT')
        need(str(Path(sys.executable).resolve()) == PYTHON_REAL and str(Path(NODE).resolve()) == NODE_REAL, 'EXECUTOR_BINARY')
        for item in manifest['topology']:
            path = Path(item['path'])
            need(path.is_symlink() and os.readlink(path) == item['target'] and str(path.resolve()) == item['resolved'], 'EXECUTOR_TOPOLOGY')
        expected = {item['path']: item['sha256'] for item in manifest['inputFiles'] + manifest['ownedFiles']}
        need(len(expected) == len(manifest['inputFiles']) + len(manifest['ownedFiles']), 'EXECUTOR_DUPLICATE_PIN')
        expected[NAME + '/source-manifest.json'] = sha((CAPSULE / 'source-manifest.json').read_bytes())
        need(set(plan['pins']) == set(expected) | set(manifest['requiredAffectedReviews'])
             and all(plan['pins'][name] == digest for name, digest in expected.items()), 'EXECUTOR_PIN_UNION')
        for item in manifest['inputFiles'] + manifest['ownedFiles']:
            need(pin_path(item['path']).stat().st_size == item['bytes'], 'EXECUTOR_PIN_SIZE')
        before = verify(plan['pins'], min(work_end, STARTED + 20)); build_authority(manifest)
        guard(min(work_end, STARTED + 20), 'EXECUTOR_PREFLIGHT_DEADLINE')
        commands = [[NODE, '--test', '--test-concurrency=1', 'test/df010-c02-synthetic.test.mjs']]
        need(plan['commands'] == commands, 'EXECUTOR_EXACT_COMMANDS')
        for path in (private, evidence): need(not path.exists() and not path.is_symlink(), 'EXECUTOR_NAMESPACE_CONSUMED')
        private_directory(private); private_directory(evidence); evidence_id = identity(evidence); evidence_owned = True
        temporary = private / 'tmp'; private_directory(temporary)
        environment = dict(os.environ); environment['TMPDIR'] = str(temporary)
        guard(work_end); need(sha(plan_path.read_bytes()) == plan_digest, 'EXECUTOR_PLAN_DRIFT')
        row, _, _, _, stdout = run_command(commands[0], 1, private, work_end, 60, 5, environment); rows.append(row)
        need(row['failureCode'] is None and row['exitCode'] == 0 and row['captureComplete']
             and row['processGroupState'] == 'ABSENT_OBSERVED', 'EXECUTOR_DF010_C02_COMMAND_FAILED')
        guard(work_end)
        stream = row['privateStreams']['stdout']
        need(type(stdout) is bytes and len(stdout) == stream['bytes'] and sha(stdout) == stream['sha256']
             and stream['prefixVerified'] and stream['complete'], 'EXECUTOR_TAP_CAPTURE_BINDING')
        footer = tap_footer(stdout)
        after = verify(plan['pins'], work_end); build_authority(manifest)
        need(sha(plan_path.read_bytes()) == plan_digest, 'EXECUTOR_PLAN_DRIFT'); guard(work_end); finalized = True
    except Exception:
        FIRST_REASON = FIRST_REASON or 'EXECUTOR_DF010_C02_GATE_FAILED'; finalized = False
    finally:
        try:
            guard(end, cleanup=True)
            if evidence_owned:
                owned_directory(evidence); need(identity(evidence) == evidence_id, 'EXECUTOR_EVIDENCE_REPLACED')
                if finalized:
                    verify(plan['pins'], end); need(sha(plan_path.read_bytes()) == plan_digest, 'EXECUTOR_PLAN_DRIFT')
                record.update({'result': 'PASS' if finalized and not STOP_REQUESTED else 'FAILED_HOLD', 'failureCode': FIRST_REASON,
                               'tapFooter': footer, 'before': before, 'after': after,
                               'durationSeconds': round(time.monotonic() - STARTED, 6), 'actualCommands': len(rows),
                               'privateStdoutFooterOnlyDecoded': footer is not None, 'privateStderrDecoded': False})
                for name, value in [('root-plan.json', plan), ('executor-result.json', record),
                                    ('command-results.json', {'commands': rows}), ('before-after.json', {'before': before, 'after': after})]:
                    guard(end, cleanup=True); save(evidence / name, value, fresh=True)
                guard(end); finalized = finalized and not STOP_REQUESTED
            else: finalized = False
            if marker_owned:
                save(marker, {'state': 'PASS' if finalized else 'FAILED_HOLD', 'failureCode': FIRST_REASON, 'finalized': finalized}, expected_identity=marker_id)
        except Exception: finalized = False
    return 0 if finalized and not STOP_REQUESTED and time.monotonic() < end else 1


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, latch_interruption); signal.signal(signal.SIGINT, latch_interruption)
    try: terminal_code = main()
    except BaseException: terminal_code = 1
    sys.exit(terminal_code)
