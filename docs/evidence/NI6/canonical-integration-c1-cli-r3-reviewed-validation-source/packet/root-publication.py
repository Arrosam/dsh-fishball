"""Source-only proposed original CLI case driver; one shared family deadline; root GO required."""
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
NAME='.runtime/ni6-canonical-integration-c1/validation/cli-r3'
CAPSULE=ROOT/NAME
HOST=ROOT/'.runtime/dsh-web'
NODE='/opt/homebrew/opt/node@22/bin/node'
PYTHON='/opt/homebrew/bin/python3'
NODE_REAL='/opt/homebrew/Cellar/node@22/22.22.2_1/bin/node'
PYTHON_REAL='/opt/homebrew/Cellar/python@3.14/3.14.5/Frameworks/Python.framework/Versions/3.14/bin/python3.14'
BINARY_HASHES={NODE_REAL:'463b47d6e984e4f84cd2421dabf5081414e40ab9d967e828b2db7858e707f6de',
 PYTHON_REAL:'2477b47fa3ae65b9574eb18a15edb364e96948eaa1875ad3f1c80d780efc9c12'}
PLAN_NAME='.runtime/root-ni6-canonical-integration-c1-cli-r3-plan.json'
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


FAILURE_CODES=('ADMIN_ARGUMENTS', 'ADMIN_BOOT', 'ADMIN_BOUNDARY_FIELDS', 'ADMIN_BOUNDARY_VALUE', 'ADMIN_CASE_BOOLEAN', 'ADMIN_CASE_CONSUMED', 'ADMIN_CASE_FIELDS', 'ADMIN_CASE_REFUSAL', 'ADMIN_CASE_TIME', 'ADMIN_CASE_VALUE', 'ADMIN_CHILD_BOOLEAN', 'ADMIN_CHILD_EXIT', 'ADMIN_CHILD_FIELDS', 'ADMIN_CHILD_ID', 'ADMIN_CHILD_STATE', 'ADMIN_COMMAND_FIELDS', 'ADMIN_DESTINATION_EXISTS', 'ADMIN_ENVIRONMENT', 'ADMIN_FAMILY_DEADLINE', 'ADMIN_IDENTITY', 'ADMIN_MARKER_FIELDS', 'ADMIN_PIN_DRIFT', 'ADMIN_PIN_UNION', 'ADMIN_PLAN_DIGEST', 'ADMIN_PLAN_DRIFT', 'ADMIN_PUBLICATION_INPUT', 'ADMIN_PUBLIC_BOUND', 'ADMIN_READBACK', 'ADMIN_RECORD_TYPE', 'ADMIN_RETURN_CHUNK', 'ADMIN_RETURN_COUNT', 'ADMIN_RETURN_EXIT', 'ADMIN_RETURN_FIELDS', 'ADMIN_RETURN_KIND', 'ADMIN_RETURN_OUTPUT', 'ADMIN_RETURN_SESSION', 'ADMIN_RETURN_TIME', 'ADMIN_ROOT_SELECTION', 'ADMIN_SIGNAL', 'ADMIN_SIGNAL_OUTCOME', 'ADMIN_STDIN_BOUND', 'ADMIN_STREAM_BOOLEAN', 'ADMIN_STREAM_FIELDS', 'ADMIN_STREAM_VALUE', 'ADMIN_TOPOLOGY', 'EXECUTOR_ACCESS_FIELDS', 'EXECUTOR_AGGREGATE_DEADLINE', 'EXECUTOR_ARGUMENTS', 'EXECUTOR_AUTH_COOKIE', 'EXECUTOR_AUTH_EXCHANGE', 'EXECUTOR_AUTH_ORDER', 'EXECUTOR_BEFORE_CONSENT', 'EXECUTOR_BINARY_FILE', 'EXECUTOR_BUILD_PIN', 'EXECUTOR_BUILD_PROOF', 'EXECUTOR_BUILD_PROOF_SHAPE', 'EXECUTOR_CAPTURE_CLOSE_UNKNOWN', 'EXECUTOR_CAPTURE_READBACK', 'EXECUTOR_CAPTURE_READBACK_UNKNOWN', 'EXECUTOR_CASE_CONSUMED', 'EXECUTOR_CASE_HTTP_BOUND', 'EXECUTOR_CASE_REPLACED', 'EXECUTOR_CLEANUP_UNKNOWN', 'EXECUTOR_CLI_EARLY_EXIT', 'EXECUTOR_CLI_GATE_FAILED', 'EXECUTOR_CLI_NOT_ALIVE_BEFORE_STOP', 'EXECUTOR_CLI_SPAWN', 'EXECUTOR_CLI_STOP_NOT_ESTABLISHED', 'EXECUTOR_CONTAINMENT', 'EXECUTOR_COPY_CONTAINMENT', 'EXECUTOR_COPY_PIN', 'EXECUTOR_COPY_READBACK', 'EXECUTOR_DIGEST', 'EXECUTOR_DUPLICATE_INTAKE', 'EXECUTOR_DUPLICATE_JSON_MEMBER', 'EXECUTOR_ENVIRONMENT', 'EXECUTOR_EOF_NOT_ESTABLISHED', 'EXECUTOR_FAMILY_DEADLINE', 'EXECUTOR_FILE_IDENTITY', 'EXECUTOR_FIRST_INTAKE', 'EXECUTOR_FORCED_CLEANUP', 'EXECUTOR_FOREIGN_ORIGIN', 'EXECUTOR_HTTP_BOUND', 'EXECUTOR_HTTP_CONTROL_BOUND', 'EXECUTOR_HTTP_CONTROL_HEADER', 'EXECUTOR_HTTP_CONTROL_RESTORATION', 'EXECUTOR_HTTP_CONTROL_SOCKET_CLEANUP', 'EXECUTOR_HTTP_CONTROL_SUCCESS', 'EXECUTOR_HTTP_CONTROL_TIMEOUT', 'EXECUTOR_HTTP_TIMER_NOT_AVAILABLE', 'EXECUTOR_HTTP_TOTAL_DEADLINE', 'EXECUTOR_IDENTITY', 'EXECUTOR_INITIAL_TASKS', 'EXECUTOR_INTERRUPTED', 'EXECUTOR_JSON_BOUND', 'EXECUTOR_JSON_CONSTANT', 'EXECUTOR_LISTENER_NOT_ABSENT', 'EXECUTOR_NEGATIVE_LEAVES', 'EXECUTOR_NEGATIVE_NATIVE_FALLBACK', 'EXECUTOR_NEGATIVE_NO_WRITES', 'EXECUTOR_NEGATIVE_ORIGINAL_ENTRY', 'EXECUTOR_OBSERVER_READY', 'EXECUTOR_ORIGINAL_RETURN_NOT_ESTABLISHED', 'EXECUTOR_ORIGINAL_TEARDOWN_NOT_ESTABLISHED', 'EXECUTOR_OUTPUT_BOUND', 'EXECUTOR_OWNED_READ_BOUND', 'EXECUTOR_OWNED_RECORD', 'EXECUTOR_PATH', 'EXECUTOR_PAUSED_STATE', 'EXECUTOR_PAUSE_WORKERS', 'EXECUTOR_PHYSICAL_PRODUCT_DRIFT', 'EXECUTOR_PIN_DRIFT', 'EXECUTOR_PIN_UNION', 'EXECUTOR_PLAN_BOUND', 'EXECUTOR_PLAN_DRIFT', 'EXECUTOR_PLAN_FIELDS', 'EXECUTOR_PLAN_SELECTION', 'EXECUTOR_PREVIEW_NO_WRITES', 'EXECUTOR_PRIVATE_DIRECTORY', 'EXECUTOR_PRIVATE_ENDPOINT', 'EXECUTOR_PRIVATE_FILE', 'EXECUTOR_PUBLIC_BOUND', 'EXECUTOR_READY_FAILURE_PROTOCOL', 'EXECUTOR_READY_FIELDS', 'EXECUTOR_READY_STAGE_ABS', 'EXECUTOR_READY_STAGE_AGR', 'EXECUTOR_READY_STAGE_ATT', 'EXECUTOR_READY_STAGE_AUT', 'EXECUTOR_READY_STAGE_DIS', 'EXECUTOR_READY_STAGE_ENA', 'EXECUTOR_READY_STAGE_ENT', 'EXECUTOR_READY_STAGE_FIB', 'EXECUTOR_READY_STAGE_HST', 'EXECUTOR_READY_STAGE_INV', 'EXECUTOR_READY_STAGE_LAF', 'EXECUTOR_READY_STAGE_LPR', 'EXECUTOR_READY_STAGE_PHA', 'EXECUTOR_READY_STAGE_PRT', 'EXECUTOR_READY_STAGE_PUB', 'EXECUTOR_READY_STAGE_REP', 'EXECUTOR_READY_STAGE_SRV', 'EXECUTOR_READY_STAGE_SSR', 'EXECUTOR_READY_STAGE_WRT', 'EXECUTOR_READY_TYPES', 'EXECUTOR_RECONCILED_NO_REPLAY', 'EXECUTOR_REGULAR_FILE', 'EXECUTOR_REQUEST_BOUND', 'EXECUTOR_RESPONSE_BOUND', 'EXECUTOR_RESTART_DEDUP', 'EXECUTOR_RESTART_TASK', 'EXECUTOR_ROOT_GO', 'EXECUTOR_RPC_REFUSAL', 'EXECUTOR_RPC_STATUS', 'EXECUTOR_SAME_STORE_METADATA', 'EXECUTOR_SELECTED_SIGTERM_NOT_SUBMITTED', 'EXECUTOR_SETUP_CONFIRM', 'EXECUTOR_SETUP_METADATA', 'EXECUTOR_SETUP_PHASE', 'EXECUTOR_SETUP_READY', 'EXECUTOR_SIGNAL_BLOCKED', 'EXECUTOR_SIGNAL_DENIED_UNKNOWN', 'EXECUTOR_SIGNAL_OWNERSHIP_UNKNOWN', 'EXECUTOR_SIGNAL_REPEAT', 'EXECUTOR_SINGLE_TASK', 'EXECUTOR_SPAWN_OR_CAPTURE_FAILED', 'EXECUTOR_TERMINATION_COUNTS', 'EXECUTOR_TERMINATION_FIELDS', 'EXECUTOR_TOPOLOGY', 'EXECUTOR_UNAUTHENTICATED_ADMISSION')
ARCHIVE=ROOT/'docs/evidence/NI6/canonical-integration-c1-cli-r3-execution'
PROOF=ROOT/'docs/evidence/NI6/canonical-integration-c1-cli-r3-actual-return.json'
CASE_NAMES=('positive','disabled','invalid')
GO=('rootReviewedExecutionGO','rootSupportedExecutionApprovalGranted','rootReviewedFinalAffectedReports')
RECORD_NAMES=('case-result.json','command-results.json','before-after.json')
RECORD_CAPS=(4096,16384,4096)

def integer(value,maximum):return type(value) is int and 0<=value<=maximum
def code(value):return value is None or value in FAILURE_CODES

def metadata(raw):
    need(type(raw) is dict and set(raw)=={'case','kind','chunkId','sessionId','exitCode','outputBytes','wallTimeSeconds'},'ADMIN_RETURN_FIELDS')
    need(raw['case'] in ('prepare','positive','disabled','invalid') and raw['kind'] in ('RETURN','TOOL_UNAVAILABLE'),'ADMIN_RETURN_KIND')
    need(raw['chunkId'] is None or type(raw['chunkId']) is str and re.fullmatch('[a-zA-Z0-9_-]{1,64}',raw['chunkId']),'ADMIN_RETURN_CHUNK')
    need(raw['sessionId'] is None or integer(raw['sessionId'],2147483647),'ADMIN_RETURN_SESSION')
    need(raw['exitCode'] is None or type(raw['exitCode']) is int and -255<=raw['exitCode']<=255,'ADMIN_RETURN_EXIT')
    need(integer(raw['outputBytes'],1048576),'ADMIN_RETURN_OUTPUT')
    need(type(raw['wallTimeSeconds']) in (int,float) and 0<=raw['wallTimeSeconds']<=180,'ADMIN_RETURN_TIME')
    return raw

def validate_record(name,value,case,pins):
    need(type(value) is dict,'ADMIN_RECORD_TYPE')
    if name=='case-result.json':
        fields={'contractVersion','case','result','failureCode','starts','httpRequests','zeroAttempts','pausedDurableTask','duplicateIntake','sameStoreReconciled','originalTeardown','listenerAbsent','refusalCode','sourceExpectedRefusalCode','directDriverReturnRequired','durationSeconds'}
        need(set(value)==fields and value['contractVersion']=='df.canonical-c1.cli-case/v1' and value['case']==case,'ADMIN_CASE_FIELDS')
        need(value['result'] in ('PASS','FAILED_HOLD') and code(value['failureCode']) and integer(value['starts'],2 if case=='positive' else 1) and integer(value['httpRequests'],32 if case=='positive' else 8),'ADMIN_CASE_VALUE')
        need(all(type(value[k]) is bool for k in ('zeroAttempts','pausedDurableTask','duplicateIntake','sameStoreReconciled','originalTeardown','listenerAbsent','directDriverReturnRequired')),'ADMIN_CASE_BOOLEAN')
        need(value['refusalCode']=='NOT_OBSERVED' and value['sourceExpectedRefusalCode']==('SETUP_UNAVAILABLE' if case=='invalid' else 'NONE') and value['directDriverReturnRequired'] is True,'ADMIN_CASE_REFUSAL')
        need(type(value['durationSeconds']) in (int,float) and 0<=value['durationSeconds']<=180,'ADMIN_CASE_TIME')
    elif name=='command-results.json':
        need(set(value)=={'commands','rawDecodedOrCopied'} and value['rawDecodedOrCopied'] is False and type(value['commands']) is list and len(value['commands'])<=(2 if case=='positive' else 1),'ADMIN_COMMAND_FIELDS')
        for row in value['commands']:
            fields={'boot','exitCode','signalAttempts','signalOutcomes','processGroupState','overflow','eof','captureComplete','forcedCleanup','failureCode','privateStreams'}
            need(type(row) is dict and set(row) in (fields,fields|{'childPid','ownedProcessGroup'}),'ADMIN_CHILD_FIELDS')
            need(type(row['boot']) is int and 1<=row['boot']<=(2 if case=='positive' else 1),'ADMIN_BOOT')
            need(row['exitCode'] is None or type(row['exitCode']) is int and -255<=row['exitCode']<=255,'ADMIN_CHILD_EXIT')
            need(row['processGroupState'] in ('NOT_STARTED','OWNED_NEW_SESSION','ABSENT_OBSERVED','UNKNOWN_OR_REMAINS') and code(row['failureCode']),'ADMIN_CHILD_STATE')
            need(all(type(row[k]) is bool for k in ('overflow','eof','captureComplete','forcedCleanup')),'ADMIN_CHILD_BOOLEAN')
            need(type(row['signalAttempts']) is list and len(row['signalAttempts'])<=2 and len(set(row['signalAttempts']))==len(row['signalAttempts']) and all(x in ('SIGTERM','SIGKILL') for x in row['signalAttempts']),'ADMIN_SIGNAL')
            need(type(row['signalOutcomes']) is list and len(row['signalOutcomes'])==len(row['signalAttempts']) and all(x in ('SUBMITTED','ALREADY_ABSENT','DENIED_UNKNOWN') for x in row['signalOutcomes']),'ADMIN_SIGNAL_OUTCOME')
            if 'childPid' in row:need(integer(row['childPid'],2147483647) and row['childPid']>0 and row['childPid']==row['ownedProcessGroup'],'ADMIN_CHILD_ID')
            need(type(row['privateStreams']) is dict and set(row['privateStreams'])<= {'stdout','stderr'},'ADMIN_STREAM_FIELDS')
            for stream in row['privateStreams'].values():
                need(type(stream) is dict and set(stream)=={'bytes','sha256','eofObserved','complete','truncated'},'ADMIN_STREAM_FIELDS')
                need(integer(stream['bytes'],65536) and (stream['sha256'] is None or type(stream['sha256']) is str and re.fullmatch('[a-f0-9]{64}',stream['sha256'])),'ADMIN_STREAM_VALUE')
                need(type(stream['eofObserved']) is bool and type(stream['complete']) is bool and (type(stream['truncated']) is bool or stream['truncated']=='UNKNOWN'),'ADMIN_STREAM_BOOLEAN')
    else:
        need(name=='before-after.json' and set(value)=={'before','after'},'ADMIN_BOUNDARY_FIELDS')
        for row in value.values():
            need(row is None or type(row) is dict and set(row)=={'inputCount','complete','unchanged'} and integer(row['inputCount'],pins) and row['complete'] is True and row['unchanged'] is True,'ADMIN_BOUNDARY_VALUE')

def snapshot(path,maximum):return bounded_owned_bytes(path,maximum)
def write_raw(path,raw,maximum):
    need(len(raw)<=maximum,'ADMIN_PUBLIC_BOUND')
    with exclusive(path) as handle:
        stamp=owned_handle(path,handle);handle.write(raw);handle.flush();os.fsync(handle.fileno());owned_handle(path,handle,stamp)
    need(snapshot(path,maximum)==raw,'ADMIN_READBACK')
def put(path,value,maximum):write_raw(path,(json.dumps(value,indent=2,sort_keys=True,allow_nan=False)+'\n').encode(),maximum)

def prepare(value):
    need(type(value) is dict and set(value)==set(GO)|{'pins'} and all(value[k] is True for k in GO),'ADMIN_ROOT_SELECTION')
    proposal=read_json(CAPSULE/'execution-plan.proposed.json',65536);manifest=read_json(CAPSULE/'source-manifest.json')
    expected={x['path']:x['sha256'] for x in manifest['inputFiles']+manifest['ownedFiles']}
    expected[NAME+'/source-manifest.json']=sha((CAPSULE/'source-manifest.json').read_bytes())
    need(type(value['pins']) is dict and set(value['pins'])==set(expected)|set(manifest['requiredAffectedReviews']) and all(value['pins'][p]==h for p,h in expected.items()),'ADMIN_PIN_UNION')
    deadline=STARTED+180
    for p,h in value['pins'].items():
        guard(min(STARTED+10,deadline-10));need(type(h) is str and re.fullmatch('[a-f0-9]{64}',h) and sha(pin_path(p).read_bytes())==h,'ADMIN_PIN_DRIFT')
    for row in manifest['topology']:
        p=Path(row['path']);need(p.is_symlink() and os.readlink(p)==row['target'] and str(p.resolve())==row['resolved'],'ADMIN_TOPOLOGY')
    for key in manifest['environmentMustBeAbsent']:need(key not in os.environ,'ADMIN_ENVIRONMENT')
    need(not ARCHIVE.exists() and not PROOF.exists() and not (CAPSULE/'cases').exists(),'ADMIN_DESTINATION_EXISTS')
    for case in CASE_NAMES:need(not (CAPSULE/('invocation-'+case+'.json')).exists(),'ADMIN_CASE_CONSUMED')
    plan=dict(proposal);plan.update(value);plan['rootFamilyDeadlineMonotonic']=deadline
    raw=(json.dumps(plan,indent=2,sort_keys=True,allow_nan=False)+'\n').encode()
    write_raw(ROOT/PLAN_NAME,raw,65536);guard(min(STARTED+10,deadline-10))
    print(json.dumps({'prepared':True,'planSha256':sha(raw),'familyRemainingSeconds':deadline-time.monotonic(),'familyDeadlineMonotonic':deadline},separators=(',',':')))
    return 0

def publish(value):
    need(type(value) is dict and set(value)=={'originalToolReturns','controllerCode','expectedPlanSha256','familyDeadlineMonotonic'} and value['controllerCode'] in ('COMPLETE','STOPPED','TOOL_UNAVAILABLE','PREPARE_FAILED'),'ADMIN_PUBLICATION_INPUT')
    need(type(value['originalToolReturns']) is list and 1<=len(value['originalToolReturns'])<=192,'ADMIN_RETURN_COUNT')
    returns=[metadata(x) for x in value['originalToolReturns']]
    plan_path=ROOT/PLAN_NAME;plan_raw=None;plan=None;deadline=value['familyDeadlineMonotonic'];plan_bound=False
    need(deadline is None or type(deadline) in (int,float) and deadline>0,'ADMIN_FAMILY_DEADLINE')
    need(value['expectedPlanSha256'] is None or type(value['expectedPlanSha256']) is str and re.fullmatch('[a-f0-9]{64}',value['expectedPlanSha256']),'ADMIN_PLAN_DIGEST')
    original_deadline=deadline
    if deadline is None:deadline=STARTED+10
    if plan_path.exists():
        plan_raw=snapshot(plan_path,65536);plan=strict_json(plan_raw)
        plan_bound=value['expectedPlanSha256']==sha(plan_raw) and original_deadline is not None and plan['rootFamilyDeadlineMonotonic']==original_deadline
    publication_end=min(STARTED+10,deadline)
    within_start=original_deadline is not None and time.monotonic()<deadline
    private_directory(ARCHIVE);records=[];missing=[];case_outcomes={};archive_complete=plan_bound;first_failure=None
    # Read ONLY exact closed public paths; no private readiness/access/captures.
    for case in CASE_NAMES:
        seen=[x for x in returns if x['case']==case]
        if not seen:case_outcomes[case]='NOT_RUN_STOP_AFTER_FIRST_FAILURE';continue
        target=ARCHIVE/case;private_directory(target);closed=None
        for name,maximum in zip(RECORD_NAMES,RECORD_CAPS):
            rel=NAME+'/cases/'+case+'/public/'+name
            try:
                guard(publication_end,cleanup=True);raw=snapshot(ROOT/rel,maximum);v=strict_json(raw);validate_record(name,v,case,len(plan['pins']) if plan else 10000)
                write_raw(target/name,raw,maximum);records.append({'path':str((target/name).relative_to(ROOT)),'bytes':len(raw),'sha256':sha(raw)})
                if name=='case-result.json':
                    closed=v
                    first_failure=first_failure or v['failureCode']
                guard(publication_end,cleanup=True)
            except BaseException:missing.append({'case':case,'record':name,'status':'ABSENT_OR_UNCERTAIN'});archive_complete=False
        marker=CAPSULE/('invocation-'+case+'.json')
        try:
            guard(publication_end,cleanup=True);raw=snapshot(marker,4096);v=strict_json(raw)
            need(type(v) is dict and set(v) in ({'state'},{'state','failureCode'}) and v['state'] in ('IN_PROGRESS','PASS','FAILED_HOLD') and code(v.get('failureCode')),'ADMIN_MARKER_FIELDS')
            write_raw(target/'invocation-result.json',raw,4096);records.append({'path':str((target/'invocation-result.json').relative_to(ROOT)),'bytes':len(raw),'sha256':sha(raw)})
        except BaseException:missing.append({'case':case,'record':'invocation-result.json','status':'ABSENT_OR_UNCERTAIN'});archive_complete=False
        complete_return=seen[-1]['kind']=='RETURN' and seen[-1]['exitCode']==0 and seen[-1]['sessionId'] is None and all(x['outputBytes']==0 for x in seen)
        case_outcomes[case]='PASS' if complete_return and closed is not None and closed['result']=='PASS' else 'FAILED_HOLD'
    if plan_raw is not None and plan_bound:
        try:
            guard(publication_end,cleanup=True);write_raw(ARCHIVE/'root-plan.json',plan_raw,65536);records.append({'path':str((ARCHIVE/'root-plan.json').relative_to(ROOT)),'bytes':len(plan_raw),'sha256':sha(plan_raw)})
            need(snapshot(plan_path,65536)==plan_raw,'ADMIN_PLAN_DRIFT')
        except BaseException:archive_complete=False;missing.append({'case':'family','record':'root-plan.json','status':'ABSENT_OR_UNCERTAIN'})
    else:archive_complete=False;missing.append({'case':'family','record':'root-plan.json','status':'ABSENT_OR_UNCERTAIN'})
    within_final=within_start and time.monotonic()<publication_end
    passed=value['controllerCode']=='COMPLETE' and archive_complete and within_final and all(case_outcomes.get(c)=='PASS' for c in CASE_NAMES)
    proof={'schema':'df.canonical-c1.cli-r3-actual-return/v1','result':'PASS' if passed else 'FAILED_HOLD','disposition':'CONSUMED_DO_NOT_REPLAY',
        'controllerCode':value['controllerCode'],'failureCode':first_failure,'originalToolReturns':returns,'cases':case_outcomes,'recordPins':records,'missingOrUncertain':missing,
        'publication':{'withinOriginalFamilyAtStart':within_start,'withinOriginalFamilyBeforeProof':within_final,'closedArchiveComplete':archive_complete,'originalPlanDigestBound':plan_bound,'secondsCap':10,'noPrivateContentRead':True},
        'runtimeInterpreterStartsMaximum':7,'administrativeInterpreterStartsMaximum':2,'fullAcceptance':False,
        'directPublicationToolReturnRequired':True,'finalProofWriteTimingRequiredFromRoot':True}
    # Even a missed window is recorded FAILED_HOLD; no new case, cleanup or reset.
    put(PROOF,proof,65536)
    return 0 if passed and time.monotonic()<publication_end else 1

def main():
    need(Path.cwd()==ROOT and Path(__file__).resolve()==CAPSULE/'root-publication.py' and str(Path(sys.executable).resolve())==PYTHON_REAL,'ADMIN_IDENTITY')
    need(len(sys.argv)==2 and sys.argv[1] in ('prepare','publish'),'ADMIN_ARGUMENTS')
    raw=sys.stdin.buffer.read(65537);need(len(raw)<=65536,'ADMIN_STDIN_BOUND');value=strict_json(raw)
    return prepare(value) if sys.argv[1]=='prepare' else publish(value)

if __name__=='__main__':
    try:terminal_code=main()
    except BaseException:terminal_code=1
    sys.exit(terminal_code)
