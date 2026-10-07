"""New source-only proposed executor. Exact two Node commands; root GO required."""
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
NAME='.runtime/ni6-public-preparation-bootstrap-diagnostic-r4'
CAPSULE=ROOT/NAME
HOST=ROOT/'.runtime/dsh-web'
NODE='/opt/homebrew/opt/node@22/bin/node'
PYTHON='/opt/homebrew/bin/python3'
NODE_REAL='/opt/homebrew/Cellar/node@22/22.22.2_1/bin/node'
PYTHON_REAL='/opt/homebrew/Cellar/python@3.14/3.14.5/Frameworks/Python.framework/Versions/3.14/bin/python3.14'
BINARY_HASHES={NODE_REAL:'463b47d6e984e4f84cd2421dabf5081414e40ab9d967e828b2db7858e707f6de',
 PYTHON_REAL:'2477b47fa3ae65b9574eb18a15edb364e96948eaa1875ad3f1c80d780efc9c12'}
PLAN_NAME='.runtime/root-ni6-bootstrap-diagnostic-r4-execution-plan.json'
GRAPH_NAME='.runtime/ni3-native-runtime/public-graph-pins.json'
STOP_REQUESTED=False
FIRST_REASON=None
COMMAND_BOOKKEEPING=1.0
STREAM_CAP=131072
AGGREGATE_CAP=262144
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


def verify(pins, graph, deadline):
    for name,digest in pins.items():
        guard(deadline)
        need(type(digest) is str and re.fullmatch('[a-f0-9]{64}',digest), 'EXECUTOR_DIGEST')
        need(sha(pin_path(name).read_bytes()) == digest, 'EXECUTOR_PIN_DRIFT')
        guard(deadline)
    need(graph['root'] == str(HOST) and len(graph['files']) == 27577 and len(graph['links']) == 12,
         'EXECUTOR_HOST_GRAPH')
    for name,digest in graph['files'].items():
        guard(deadline)
        need(name.startswith('node_modules/'), 'EXECUTOR_HOST_SCOPE')
        need(sha(contained('.runtime/dsh-web/' + name).read_bytes()) == digest, 'EXECUTOR_HOST_DRIFT')
        guard(deadline)
    for name,row in graph['links'].items():
        guard(deadline)
        path=HOST/name
        need(name.startswith('node_modules/') and all(p not in ('','.','..') for p in name.split('/'))
             and path.is_symlink() and os.readlink(path)==row['target'] and str(path.resolve())==row['resolved'],
             'EXECUTOR_HOST_LINK')
        guard(deadline)
    files,links=set(),set()
    for directory,subdirs,names in os.walk(HOST/'node_modules',followlinks=False):
        guard(deadline)
        current=Path(directory)
        need(current.resolve()==current,'EXECUTOR_HOST_CONTAINMENT')
        for name in list(subdirs)+names:
            guard(deadline)
            path=current/name
            rel=path.relative_to(HOST).as_posix()
            if path.is_symlink():
                need(rel in graph['links'],'EXECUTOR_HOST_UNPINNED_LINK'); links.add(rel)
                if name in subdirs: subdirs.remove(name)
            elif path.is_file():
                need(rel in graph['files'],'EXECUTOR_HOST_UNPINNED_FILE'); files.add(rel)
            else:
                need(path.is_dir() and path.resolve()==path,'EXECUTOR_HOST_ENTRY')
        guard(deadline)
    need(files==set(graph['files']) and links==set(graph['links']),'EXECUTOR_HOST_INVENTORY')
    guard(deadline)
    return {'inputCount':len(pins),'wholeHostFiles':27577,'wholeHostLinks':12,'complete':True,'unchanged':True}


def group_exists(pgid):
    try:
        os.killpg(pgid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return None


def run_command(argv, index, private, deadline, cap, cleanup_seconds):
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
    return row, paths, started, hard_end


def diagnostic_value(path,manifest):
    raw=bounded_owned_bytes(path,512)
    value=strict_json(raw)
    fields={'contractVersion','result','phase','category','completedPlugins','entryRemoved','rootClosed','zeroNative','all87','CODE'}
    need(type(value) is dict and set(value)==fields,'EXECUTOR_DIAGNOSTIC_FIELDS')
    need(value['contractVersion']=='df.ni6-prep01-bootstrap-diagnostic/v1' and value['all87']=='HOLD'
         and value['CODE']=='BLOCKED_UNCHANGED' and value['result'] in ('PASS','FAILED_HOLD')
         and value['phase'] in manifest['phases'] and value['category'] in manifest['categories'],
         'EXECUTOR_DIAGNOSTIC_ENUM')
    need(type(value['completedPlugins']) is int and 0<=value['completedPlugins']<=11
         and all(type(value[n]) is bool for n in ('entryRemoved','rootClosed','zeroNative')),
         'EXECUTOR_DIAGNOSTIC_TYPES')
    if value['result']=='PASS':
        need(value['phase']=='COMPLETE' and value['category']=='NONE' and value['completedPlugins']==11
             and value['entryRemoved'] and value['rootClosed'] and value['zeroNative'],'EXECUTOR_DIAGNOSTIC_PASS')
    else:
        need(value['phase']!='COMPLETE' and value['category']!='NONE','EXECUTOR_DIAGNOSTIC_FAILURE')
    return value,raw


def main():
    global FIRST_REASON
    end=STARTED+90.0
    primary_end=STARTED+85.0  # Nonadditive terminal reserve lives inside 90 seconds.
    setup_end=STARTED+20.0
    marker_owned=evidence_owned=private_owned=False
    marker_id=evidence_id=private_id=None
    marker=CAPSULE/'invocation.json'
    evidence=ROOT/'docs/evidence/NI6/bootstrap-diagnostic-r4-execution'
    private=CAPSULE/'private-capture'
    result_path=CAPSULE/'diagnostic-result.json'
    rows=[]; before=after=None; selected=None; finalized=False; plan_digest=None
    marker_value={'contractVersion':'df.ni6-prep01-bootstrap-diagnostic-invocation/v1',
                  'state':'IN_PROGRESS','finalized':False,'startedAt':now()}
    public={'contractVersion':'df.ni6-prep01-bootstrap-diagnostic-executor/v1','result':'FAILED_HOLD',
            'finalized':False,'failureCode':'EXECUTOR_INCOMPLETE','commands':rows,
            'diagnostic':None,'before':None,'after':None,'all87':'HOLD','CODE':'BLOCKED_UNCHANGED'}
    def evidence_owner():
        need(evidence_owned,'EXECUTOR_EVIDENCE_NOT_OWNED'); owned_directory(evidence)
        need(identity(evidence)==evidence_id,'EXECUTOR_EVIDENCE_REPLACED')
    def private_owner():
        need(private_owned,'EXECUTOR_CAPTURE_NOT_OWNED'); owned_directory(private)
        need(identity(private)==private_id,'EXECUTOR_CAPTURE_REPLACED')
    def marker_owner():
        need(marker_owned,'EXECUTOR_MARKER_NOT_OWNED'); owned_file(marker)
        need(identity(marker)==marker_id,'EXECUTOR_MARKER_REPLACED')
    def put(name,value):
        evidence_owner(); guard(end,cleanup=True)
        save(evidence/name,value,fresh=True); guard(end,cleanup=True)
    try:
        guard(setup_end)
        need(len(sys.argv)==2 and sys.argv[1]==PLAN_NAME and Path.cwd()==ROOT and ROOT.resolve()==ROOT
             and Path(__file__).resolve()==CAPSULE/'run-once.py','EXECUTOR_IDENTITY')
        owned_directory(CAPSULE)
        # Fresh exclusive consumption is first, before environment/plan/pin gates.
        marker_id=save(marker,marker_value,fresh=True); owned_file(marker)
        need(identity(marker)==marker_id,'EXECUTOR_MARKER_REPLACED'); marker_owned=True
        guard(setup_end)
        proposal=read_json(CAPSULE/'execution-plan.proposed.json')
        plan_path=contained(PLAN_NAME); owned_file(plan_path)
        plan_raw=plan_path.read_bytes(); plan_digest=sha(plan_raw); plan=strict_json(plan_raw)
        manifest_path=CAPSULE/'source-manifest.json'; manifest=read_json(manifest_path)
        need(set(plan)==set(proposal),'EXECUTOR_PLAN_FIELDS')
        for key in proposal:
            if key not in ('rootReviewedExecutionGO','rootSupportedExecutionApprovalGranted','rootReviewedFinalAffectedReports','pins'):
                need(plan[key]==proposal[key],'EXECUTOR_PLAN_SELECTION')
        need(plan['rootReviewedExecutionGO'] is True and plan['rootSupportedExecutionApprovalGranted'] is True
             and plan['rootReviewedFinalAffectedReports'] is True,'EXECUTOR_ROOT_GO')
        commands=[[NODE,'--check',NAME+'/diagnostic.mjs'],[NODE,NAME+'/diagnostic.mjs']]
        need(plan['commands']==commands and plan['runCountAuthorized']==1 and plan['runner']==NAME+'/run-once.py'
             and plan['all87']=='HOLD' and plan['CODE']=='BLOCKED_UNCHANGED','EXECUTOR_EXACT_COMMANDS')
        for name in manifest['environmentMustBeAbsent']:
            need(name not in os.environ,'EXECUTOR_ENVIRONMENT')
        need(str(Path(NODE).resolve())==NODE_REAL and str(Path(PYTHON).resolve())==PYTHON_REAL
             and str(Path(sys.executable).resolve())==PYTHON_REAL,'EXECUTOR_CANONICAL_BINARY')
        for row in manifest['topology']:
            guard(setup_end); path=Path(row['path'])
            need(path.is_symlink() and os.readlink(path)==row['target'] and str(path.resolve())==row['resolved'],
                 'EXECUTOR_ALIAS_TOPOLOGY')
        expected={}
        for row in manifest['ownedFiles']+manifest['inputFiles']:
            need(row['path'] not in expected,'EXECUTOR_MANIFEST_DUPLICATE')
            expected[row['path']]=row['sha256']
            path=pin_path(row['path'])
            need(path.stat().st_size==row['bytes'],'EXECUTOR_INPUT_SIZE')
        expected[NAME+'/source-manifest.json']=sha(manifest_path.read_bytes())
        need(type(plan['pins']) is dict and set(plan['pins'])==set(expected)|set(manifest['requiredAffectedReviews']),
             'EXECUTOR_PIN_UNION')
        need(all(plan['pins'][key]==digest for key,digest in expected.items()),'EXECUTOR_PIN_SELECTION')
        graph=read_json(contained(GRAPH_NAME))
        before=verify(plan['pins'],graph,setup_end)
        actual=read_json(contained(manifest['actualBuildReturn']))
        need(actual['contractVersion']=='df.ni6-prep01-observed-build-driver-return/v1' and actual['actualDriverExitCode']==0
             and actual['actualCommandsExitZero']==4 and actual['fixtureManifestSha256']==manifest['ancestorSourceManifestSha256']
             and actual['generatedClientSha256']==manifest['builtClientSha256']
             and actual['generatedDescriptorSha256']==manifest['builtDescriptorSha256'],'EXECUTOR_ACTUAL_BUILD_RETURN')
        need(not result_path.exists() and not result_path.is_symlink()
             and not (CAPSULE/'private-runtime').exists() and not (CAPSULE/'private-runtime').is_symlink(),
             'EXECUTOR_NAMESPACE_CONSUMED')
        guard(setup_end)
        # Latches are assigned ONLY after successful fresh creation and ownership verification.
        private_directory(private); private_id=identity(private); private_owned=True
        private_directory(evidence); evidence_id=identity(evidence); evidence_owned=True
        guard(primary_end)
        for index,argv in enumerate(commands,1):
            private_owner(); guard(primary_end)
            need(sha(plan_path.read_bytes())==plan_digest,'EXECUTOR_PLAN_DRIFT')
            # Recheck executable/source pins before each admission; Node itself
            # checks the complete host graph before any original module import.
            for name,digest in plan['pins'].items():
                guard(primary_end)
                need(sha(pin_path(name).read_bytes())==digest,'EXECUTOR_PIN_DRIFT')
                guard(primary_end)
            cap,cleanup=(5.0,1.0) if index==1 else (35.0,4.0)
            row,_,_,_=run_command(argv,index,private,primary_end,cap,cleanup)
            rows.append(row)
            if row['failureCode'] is not None:
                FIRST_REASON=FIRST_REASON or row['failureCode']; break
        # A failed Node invocation can supply only a validated FAILED_HOLD diagnostic,
        # never PASS or an exit/group/EOF substitute. No raw stream is decoded.
        verification_end=min(primary_end,time.monotonic()+25.0)
        after=verify(plan['pins'],graph,verification_end)
        need(sha(plan_path.read_bytes())==plan_digest,'EXECUTOR_PLAN_DRIFT')
        if len(rows)==2 and rows[-1]['captureComplete'] and rows[-1]['processGroupState']=='ABSENT_OBSERVED':
            guard(verification_end)
            selected,_=diagnostic_value(result_path,manifest)
            guard(verification_end)
        need(FIRST_REASON is None,'EXECUTOR_COMMAND_FAILED')
        need(len(rows)==2 and selected is not None and selected['result']=='PASS','EXECUTOR_DIAGNOSTIC_NOT_PASS')
        guard(primary_end)
    except Exception:
        FIRST_REASON=FIRST_REASON or 'EXECUTOR_GATE_OR_OBSERVATION_FAILED'
    finally:
        # Any uncertain/pre-existing destination stays untouched. Writes require
        # each successful creation latch and original inode, not a path assignment.
        candidate=(FIRST_REASON is None and len(rows)==2 and selected is not None and selected['result']=='PASS'
                   and after is not None and not STOP_REQUESTED)
        public.update({'failureCode':FIRST_REASON,'before':before,'after':after,'diagnostic':selected,
                       'observedSeconds':time.monotonic()-STARTED,
                       'conservativeActiveSeconds':time.monotonic()-STARTED+5.0,
                       'actualDriverReturnRequired':True,'terminationProof':'OWNED_PROCESS_GROUP_AND_EOF_ONLY'})
        try:
            guard(end,cleanup=True)
            need(public['conservativeActiveSeconds']<=90,'EXECUTOR_AGGREGATE_CHARGE')
            if evidence_owned:
                put('root-plan.json',plan)
                put('before-after.json',{'before':before,'after':after})
                put('command-results.json',{'commands':rows,'stopAfterFirstFailure':True,'rawDecodedOrCopied':False})
                if selected is not None: put('diagnostic-result.json',selected)
                created=set()
                evidence_owner(); copies=evidence/'frozen-source'; private_directory(copies)
                for name in manifest['sourceCopies']:
                    guard(end,cleanup=True); evidence_owner()
                    source=contained(name); need(sha(source.read_bytes())==plan['pins'][name],'EXECUTOR_COPY_PIN')
                    target=copies/name
                    copy_parents(copies,target.parent,created)
                    with exclusive(target) as handle: handle.write(source.read_bytes())
                    need(sha(target.read_bytes())==plan['pins'][name],'EXECUTOR_COPY_READBACK')
                    guard(end,cleanup=True)
                candidate=candidate and not STOP_REQUESTED
                guard(end,cleanup=True)
                public['result']='PASS' if candidate else 'FAILED_HOLD'
                public['finalized']=candidate
                put('executor-result.json',public)
                # Completion is this last post-write stop/deadline observation.
                guard(end); finalized=candidate
            marker_owner()
            marker_value.update({'state':'PASS' if finalized else 'FAILED_HOLD','finalized':finalized,
                                 'failureCode':FIRST_REASON,'finishedAt':now()})
            guard(end,cleanup=True); save(marker,marker_value,expected_identity=marker_id); marker_owner(); guard(end,cleanup=True)
        except Exception:
            finalized=False
            FIRST_REASON=FIRST_REASON or 'EXECUTOR_FINALIZATION_FAILED'
        if STOP_REQUESTED: finalized=False
    # A persisted record alone is not proof of a successful driver return.
    return 0 if finalized and not STOP_REQUESTED and time.monotonic()<end else 1


if __name__=='__main__':
    signal.signal(signal.SIGTERM,latch_interruption)
    signal.signal(signal.SIGINT,latch_interruption)
    try: sys.exit(main())
    except BaseException: sys.exit(1)  # Never serialize a caught error or payload.
