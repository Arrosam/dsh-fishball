"""Source-only C1build-r2: four fixed canonical commands; root GO required."""
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
NAME='.runtime/ni6-canonical-integration-c1/validation/build-r2'
CAPSULE=ROOT/NAME
HOST=ROOT/'.runtime/dsh-web'
NODE='/opt/homebrew/opt/node@22/bin/node'
PYTHON='/opt/homebrew/bin/python3'
NODE_REAL='/opt/homebrew/Cellar/node@22/22.22.2_1/bin/node'
PYTHON_REAL='/opt/homebrew/Cellar/python@3.14/3.14.5/Frameworks/Python.framework/Versions/3.14/bin/python3.14'
BINARY_HASHES={NODE_REAL:'463b47d6e984e4f84cd2421dabf5081414e40ab9d967e828b2db7858e707f6de',
 PYTHON_REAL:'2477b47fa3ae65b9574eb18a15edb364e96948eaa1875ad3f1c80d780efc9c12'}
PLAN_NAME='.runtime/root-ni6-canonical-integration-c1-build-r2-plan.json'
GRAPH_NAME='.runtime/ni3-native-runtime/public-graph-pins.json'
STOP_REQUESTED=False
FIRST_REASON=None
COMMAND_BOOKKEEPING=1.0
STREAM_CAP=65536
AGGREGATE_CAP=131072
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

def syntax_inventory(expected):
    actual={d:sorted(p.name for p in (ROOT/d).iterdir() if p.suffix in ('.mjs','.cjs')) for d in ('src','scripts','test')}
    need(actual==expected,'EXECUTOR_SYNTAX_SELECTION_DRIFT')

def public_snapshot(name,maximum):
    path=contained(name);observed=path.lstat()
    need(stat.S_ISREG(observed.st_mode) and observed.st_uid==os.getuid() and observed.st_size<=maximum,'EXECUTOR_GENERATED_BOUND')
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
    with os.fdopen(fd,'rb') as handle:
        actual=os.fstat(handle.fileno());need((actual.st_dev,actual.st_ino)==(observed.st_dev,observed.st_ino),'EXECUTOR_GENERATED_IDENTITY')
        raw=handle.read(maximum+1)
        need(len(raw)==observed.st_size and len(raw)<=maximum and os.fstat(handle.fileno()).st_size==len(raw),'EXECUTOR_GENERATED_PARTIAL_READ')
    return raw,{'path':name,'bytes':len(raw),'sha256':sha(raw),'identity':[observed.st_dev,observed.st_ino]}

def output_current(witness,maximum):
    _,now=public_snapshot(witness['path'],maximum)
    need(now==witness,'EXECUTOR_GENERATED_OUTPUT_DRIFT')

def main():
    global FIRST_REASON
    end=STARTED+90;work_end=STARTED+80
    marker=CAPSULE/'invocation.json';private=CAPSULE/'private-capture';evidence=CAPSULE/'execution'
    marker_owned=evidence_owned=False;marker_id=evidence_id=None;rows=[];before=after=None;outputs=[];finalized=False;client_witness=descriptor_witness=None
    record={'contractVersion':'df.canonical-c1.build/v1','result':'FAILED_HOLD','failureCode':None,'commands':rows,'generated':outputs,'before':None,'after':None,'directDriverReturnRequired':True}
    try:
        need(len(sys.argv)==2 and sys.argv[1]==PLAN_NAME and Path.cwd()==ROOT and Path(__file__).resolve()==CAPSULE/'run-build.py','EXECUTOR_IDENTITY')
        owned_directory(CAPSULE);marker_id=save(marker,{'state':'IN_PROGRESS'},fresh=True);marker_owned=True
        proposal=read_json(CAPSULE/'execution-plan.proposed.json');manifest=read_json(CAPSULE/'source-manifest.json')
        plan_path=contained(PLAN_NAME);owned_file(plan_path);plan_raw=plan_path.read_bytes();plan_digest=sha(plan_raw);plan=strict_json(plan_raw)
        need(set(plan)==set(proposal),'EXECUTOR_PLAN_FIELDS')
        for k in proposal:
            if k not in ('rootReviewedExecutionGO','rootSupportedExecutionApprovalGranted','rootReviewedFinalAffectedReports','pins'):need(plan[k]==proposal[k],'EXECUTOR_PLAN_SELECTION')
        need(all(plan[k] is True for k in ('rootReviewedExecutionGO','rootSupportedExecutionApprovalGranted','rootReviewedFinalAffectedReports')),'EXECUTOR_ROOT_GO')
        need(plan['runCountAuthorized']==1 and plan['runner']==NAME+'/run-build.py','EXECUTOR_ONCE')
        for key in manifest['environmentMustBeAbsent']:need(key not in os.environ,'EXECUTOR_ENVIRONMENT')
        need(str(Path(sys.executable).resolve())==PYTHON_REAL and str(Path(NODE).resolve())==NODE_REAL,'EXECUTOR_BINARY')
        expected={x['path']:x['sha256'] for x in manifest['inputFiles']+manifest['ownedFiles']}
        need(len(expected)==len(manifest['inputFiles'])+len(manifest['ownedFiles']),'EXECUTOR_DUPLICATE_PIN')
        expected[NAME+'/source-manifest.json']=sha((CAPSULE/'source-manifest.json').read_bytes())
        need(set(plan['pins'])==set(expected)|set(manifest['requiredAffectedReviews']) and all(plan['pins'][p]==h for p,h in expected.items()),'EXECUTOR_PIN_UNION')
        for row in manifest['inputFiles']+manifest['ownedFiles']:need(pin_path(row['path']).stat().st_size==row['bytes'],'EXECUTOR_PIN_SIZE')
        before=verify(plan['pins'],min(work_end,STARTED+15));syntax_inventory(manifest['syntaxInventory'])
        commands=[[NODE,'scripts/check.mjs'],[NODE,'scripts/build-client.mjs'],[NODE,'scripts/build-client.mjs','--check'],[PYTHON,'scripts/build-native-source-manifest.py','--product-root',str(ROOT),'--host-root',str(HOST)]]
        need(plan['commands']==commands,'EXECUTOR_EXACT_COMMANDS')
        for p in (private,evidence):need(not p.exists() and not p.is_symlink(),'EXECUTOR_NAMESPACE_CONSUMED')
        private_directory(private);private_directory(evidence);evidence_id=identity(evidence);evidence_owned=True
        immutable={p:h for p,h in plan['pins'].items() if p not in ('lib/client.js','native-source-manifest.json')}
        for i,argv in enumerate(commands,1):
            guard(work_end);need(sha(plan_path.read_bytes())==plan_digest,'EXECUTOR_PLAN_DRIFT');verify(immutable,work_end);syntax_inventory(manifest['syntaxInventory'])
            if i>=3:output_current(client_witness,1048576)
            row,_,_,_=run_command(argv,i,private,work_end,60,4);rows.append(row)
            need(row['failureCode'] is None and row['exitCode']==0 and row['captureComplete'] and row['processGroupState']=='ABSENT_OBSERVED','EXECUTOR_BUILD_COMMAND_FAILED')
            if i==2:_,client_witness=public_snapshot('lib/client.js',1048576)
            if i>=3:output_current(client_witness,1048576)
        after=verify(immutable,work_end);syntax_inventory(manifest['syntaxInventory']);need(sha(plan_path.read_bytes())==plan_digest,'EXECUTOR_PLAN_DRIFT')
        descriptor_raw,descriptor_witness=public_snapshot('native-source-manifest.json',65536)
        generated=strict_json(descriptor_raw)
        need(generated['contractVersion']=='df.native-source/v1' and generated['host']==manifest['expectedDescriptorHost'],'EXECUTOR_DESCRIPTOR_HOST')
        need(generated['product']['name']=='dsh-fishball' and generated['product']['version']=='0.1.0-preview.1' and [x['path'] for x in generated['product']['files']]==manifest['descriptorProductPaths'],'EXECUTOR_DESCRIPTOR_PRODUCT')
        output_current(client_witness,1048576)
        for row in generated['product']['files']:need(set(row)=={'path','digest'} and sha(contained(row['path']).read_bytes())==row['digest'],'EXECUTOR_ACTUAL_PRODUCT_DIGEST')
        output_current(client_witness,1048576);output_current(descriptor_witness,65536)
        outputs.extend([{k:v for k,v in witness.items() if k!='identity'} for witness in (client_witness,descriptor_witness)])
        guard(work_end);finalized=True
    except Exception:
        FIRST_REASON=FIRST_REASON or 'EXECUTOR_BUILD_GATE_FAILED';finalized=False
    finally:
        try:
            guard(end,cleanup=True)
            if evidence_owned:
                owned_directory(evidence);need(identity(evidence)==evidence_id,'EXECUTOR_EVIDENCE_REPLACED')
                if finalized:output_current(client_witness,1048576);output_current(descriptor_witness,65536)
                record.update({'result':'PASS' if finalized and not STOP_REQUESTED else 'FAILED_HOLD','failureCode':FIRST_REASON,'before':before,'after':after,'durationSeconds':round(time.monotonic()-STARTED,6),'actualBuildCommands':len(rows),'rawStreamsDecoded':False})
                for n,v in [('root-plan.json',plan),('executor-result.json',record),('command-results.json',{'commands':rows}),('before-after.json',{'before':before,'after':after})]:save(evidence/n,v,fresh=True)
                if finalized:output_current(client_witness,1048576);output_current(descriptor_witness,65536)
                guard(end);finalized=finalized and not STOP_REQUESTED
            else:finalized=False
            if marker_owned:save(marker,{'state':'PASS' if finalized else 'FAILED_HOLD','failureCode':FIRST_REASON,'finalized':finalized},expected_identity=marker_id)
        except Exception:finalized=False
    return 0 if finalized and not STOP_REQUESTED and time.monotonic()<end else 1

if __name__=='__main__':
    signal.signal(signal.SIGTERM,latch_interruption);signal.signal(signal.SIGINT,latch_interruption)
    try: terminal_code=main()
    except BaseException: terminal_code=1
    sys.exit(terminal_code)
