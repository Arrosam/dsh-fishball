"""Prospective root-owned runner: one child, finite private capture, no raw forwarding."""
import hashlib
import json
import os
from pathlib import Path
import selectors
import signal
import stat
import subprocess
import sys
import time

NODE = Path('/opt/homebrew/Cellar/node@22/22.22.2_1/bin/node')
STREAM_CAP = 65536
OUTCOME_CAP = 16384
WORK_SECONDS = 160
DRAIN_SECONDS = 5
MAX_CAPTURE_CYCLES = 700
MAX_EXCEPTION_DRAIN_CYCLES = 64
MAX_LEADER_POLLS = 2048
AC_SHA256 = 'c00192b717d9a8c0979e8924a680f7cbb483601cca9d7d41c0805f03840c4b78'
REMEDIATION_SHA256 = '7ae5f6e264deb301072d8e1fc493e111912958853545806ce6d62213dff12dbf'
PRESERVATION_SHA256 = '6052720dfae8466b415d0ffdf4bf81064aafd22b631a8b1abe3c0b2680c54747'
REPORTED = False
NODE_CODES = frozenset([
    'SOURCE_ASSERTION_OR_UNSUPPORTED_PUBLIC_CONTRACT', 'GUARDED_ITERATOR_REFUSAL',
    'EXECUTE_UNKNOWN', 'CANCEL_UNKNOWN', 'ORIGINAL_OPERATION_DENIED',
    'ERR_ASSERTION', 'CONFIG_INVALID', 'HOST_CAPABILITY_UNSUPPORTED', 'INVALID_INPUT',
    'OPERATION_REJECTED', 'REQUEST_ABORTED', 'SERVICE_DISPOSED', 'OPERATOR_REQUIRED',
    'SETUP_REQUIRED', 'SETUP_UNAVAILABLE', 'SETUP_RECOVERY_REQUIRED', 'SETUP_PREVIEW_STALE',
    'SETUP_CONFIRMATION_REQUIRED', 'SETUP_INVALID_INPUT', 'STALE_VERSION', 'STALE_AUTHORITY',
    'STALE_MEMORY', 'COST_UNKNOWN', 'RESOURCE_LIMIT', 'RECOVERY_REQUIRED', 'RESERVATION_HELD',
    'MODEL_UNAVAILABLE', 'WORKER_SOURCE_UNAVAILABLE', 'WORKER_REQUEST_DENIED', 'WORKER_CONTEXT_INVALID',
    'WORKER_POLICY_REQUIRED', 'WORKER_POLICY_STALE', 'WORKER_PREVIEW_STALE',
    'WORKER_RESULT_UNAVAILABLE', 'WORKER_FINISH_UNAVAILABLE', 'WORKER_EXECUTION_UNAVAILABLE',
    'WORKER_EXECUTION_DENIED', 'WORKER_EXECUTION_ALREADY_SUBMITTED', 'DEADLINE_UNKNOWN',
    'BARRIER_NOT_OBSERVED', 'ORIGINAL_ABORT_NOT_OBSERVED', 'LOCAL_DRAIN_UNKNOWN',
    'R06_WINDOW_UNKNOWN', 'LOCAL_CLEANUP_UNKNOWN',
])
OUTCOME_KEYS = frozenset([
    'schema', 'outcome', 'failureCode', 'scopedGoal', 'exactMarkerMatched',
    'completedOriginalSequence', 'newPositionConsumed', 'auditReads',
    'historicalAttemptsBefore', 'additionalAttemptLimit', 'adapterAttempted',
    'adapterActive', 'adapterUncertainHold', 'controlHTTP', 'dfRPC', 'metadataHTTP',
    'cleanup', 'rootOwnerDisposeCalls', 'presetOwnerDisposeCalls', 'durableScratchRetained',
    'remoteTerminationFromCleanup', 'billing', 'browserAcceptance', 'nativeColdContinuation',
    'all87', 'CODE',
])


def digest(data):
    return hashlib.sha256(data).hexdigest()


def strict_json(data):
    def unique(pairs):
        value = {}
        for key, item in pairs:
            if key in value:
                raise ValueError('CLOSED_RECORD_INVALID')
            value[key] = item
        return value
    def refuse_constant(_value):
        raise ValueError('CLOSED_RECORD_INVALID')
    return json.loads(data.decode('utf-8', errors='strict'), object_pairs_hook=unique,
                      parse_constant=refuse_constant)


def bounded_regular(path, limit, private=False):
    before = path.lstat()
    if (not stat.S_ISREG(before.st_mode) or path.resolve() != path
            or before.st_size < 0 or before.st_size > limit):
        raise ValueError('CLOSED_RECORD_INVALID')
    if private and (before.st_nlink != 1 or before.st_uid != os.getuid() or stat.S_IMODE(before.st_mode) != 0o600):
        raise ValueError('CLOSED_RECORD_INVALID')
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        current = os.fstat(descriptor)
        if (current.st_dev, current.st_ino, current.st_size) != (before.st_dev, before.st_ino, before.st_size):
            raise ValueError('CLOSED_RECORD_INVALID')
        with os.fdopen(descriptor, 'rb') as stream:
            descriptor = None
            value = stream.read(limit + 1)
        if len(value) != before.st_size or len(value) > limit:
            raise ValueError('CLOSED_RECORD_INVALID')
        return value
    finally:
        if descriptor is not None:
            os.close(descriptor)


def integer(value, ceiling, nullable=False):
    if nullable and value is None:
        return
    if type(value) is not int or not 0 <= value <= ceiling:
        raise ValueError('CLOSED_RECORD_INVALID')


def boolean(value, nullable=False):
    if nullable and value is None:
        return
    if type(value) is not bool:
        raise ValueError('CLOSED_RECORD_INVALID')


def outcome_record(capsule):
    # Only this controlled, exclusive Node record is decoded. Never read raw streams.
    path = capsule / 'private-run' / 'observations' / 'closed-outcome.json'
    value = strict_json(bounded_regular(path, OUTCOME_CAP, private=True))
    if type(value) is not dict or set(value) != OUTCOME_KEYS:
        raise ValueError('CLOSED_RECORD_INVALID')
    constants = {'schema': 'df.ollama-live02-outcome/v1', 'historicalAttemptsBefore': 1,
                 'additionalAttemptLimit': 1, 'remoteTerminationFromCleanup': 'unproved',
                 'billing': 'unknown', 'browserAcceptance': 'HOLD', 'nativeColdContinuation': 'HOLD',
                 'all87': 'HOLD', 'CODE': 'HOLD'}
    for key, expected in constants.items():
        if type(value[key]) is not type(expected) or value[key] != expected:
            raise ValueError('CLOSED_RECORD_INVALID')
    if (value['outcome'] not in ['HOLD', 'original-sequence-observed']
            or value['scopedGoal'] not in ['PASS', 'FAIL', 'NOT_OBSERVED']
            or value['cleanup'] not in ['not-started', 'pending', 'unknown', 'public-disposers-resolved']
            or (value['failureCode'] is not None and value['failureCode'] not in NODE_CODES)):
        raise ValueError('CLOSED_RECORD_INVALID')
    for key in ['completedOriginalSequence', 'durableScratchRetained']:
        boolean(value[key])
    for key in ['newPositionConsumed', 'exactMarkerMatched', 'adapterActive', 'adapterUncertainHold']:
        boolean(value[key], nullable=True)
    for key, cap in [('adapterAttempted', 1), ('controlHTTP', 35), ('dfRPC', 30), ('metadataHTTP', 3)]:
        integer(value[key], cap, nullable=True)
    for key, cap in [('auditReads', 14), ('rootOwnerDisposeCalls', 1), ('presetOwnerDisposeCalls', 1)]:
        integer(value[key], cap)
    if ((value['scopedGoal'] == 'NOT_OBSERVED' and value['exactMarkerMatched'] is not None)
            or (value['scopedGoal'] == 'PASS' and value['exactMarkerMatched'] is not True)
            or (value['scopedGoal'] == 'FAIL' and value['exactMarkerMatched'] is not False)):
        raise ValueError('CLOSED_RECORD_INVALID')
    if value['outcome'] == 'original-sequence-observed' and value['completedOriginalSequence'] is not True:
        raise ValueError('CLOSED_RECORD_INVALID')
    if value['completedOriginalSequence'] and (value['scopedGoal'] == 'NOT_OBSERVED'
            or value['newPositionConsumed'] is not True or value['adapterAttempted'] != 1
            or (value['controlHTTP'], value['dfRPC'], value['metadataHTTP']) != (35, 30, 3)):
        raise ValueError('CLOSED_RECORD_INVALID')
    return value


def safe_emit(code, **facts):
    global REPORTED
    if REPORTED:
        return False
    REPORTED = True  # Reporter failure is not retried or allowed to escape.
    try:
        text = json.dumps({'schema': 'df.ollama-live02-private-runner/v2', 'code': code,
                           'rawStreamsPublished': False, 'billing': 'unknown', 'CODE': 'HOLD',
                           'all87': 'HOLD', **facts}, separators=(',', ':'), allow_nan=False)
        if len(text.encode('utf-8')) > OUTCOME_CAP:
            return False
        sys.stdout.write(text + '\n')
        sys.stdout.flush()
        return True
    except BaseException:
        return False


def main():
    capsule = Path(__file__).resolve().parent
    if len(sys.argv) != 1:
        safe_emit('SOURCE_ASSERTION_OR_UNSUPPORTED_PUBLIC_CONTRACT')
        return 2
    try:
        go = strict_json(bounded_regular(capsule / 'root-execution-go.json', OUTCOME_CAP))
        freeze_bytes = bounded_regular(capsule / 'source-freeze.json', 1048576)
        freeze = strict_json(freeze_bytes)
        plan_bytes = bounded_regular(capsule / 'root-plan.json', 65536)
        if not (type(go) is dict and type(freeze) is dict
                and go.get('schema') == 'df.ollama-live02-root-go/v1' and go.get('go') is True
                and go.get('onceOnly') is True and go.get('privateCommandStreams') is True
                and go.get('fixtureFreezeSha256') == digest(freeze_bytes)
                and go.get('rootPlanSha256') == digest(plan_bytes)
                and go.get('acSha256') == freeze.get('acSha256') == AC_SHA256
                and go.get('remediationSha256') == freeze.get('remediationSha256') == REMEDIATION_SHA256
                and go.get('preservationSha256') == freeze.get('preservationSha256') == PRESERVATION_SHA256
                and go.get('historicalAttemptsBefore') == 1 and go.get('maxAdditionalModelPOST') == 1
                and go.get('originalHostGraphVerified') is True
                and go.get('codeReview', {}).get('accepted') is True
                and go.get('designReview', {}).get('accepted') is True):
            safe_emit('GO_NOT_GRANTED')
            return 2
        if (freeze['node']['path'] != str(NODE) or NODE.resolve() != NODE
                or digest(bounded_regular(NODE, 209715200)) != freeze['node']['sha256']):
            raise ValueError('HOST_CAPABILITY_UNSUPPORTED')
        own_pin = next(item for item in freeze['files'] if item['path'].endswith('/run-private.py'))
        if digest(bounded_regular(capsule / 'run-private.py', 65536)) != own_pin['sha256']:
            raise ValueError('HOST_CAPABILITY_UNSUPPORTED')
        for name in ['preflight-attempt.json', 'private-run', 'private-process-output']:
            try:
                (capsule / name).lstat()
            except FileNotFoundError:
                continue
            raise ValueError('RESOURCE_LIMIT')
    except BaseException:
        safe_emit('SOURCE_ASSERTION_OR_UNSUPPORTED_PUBLIC_CONTRACT')
        return 2

    started = time.monotonic()
    child = None
    selector = None
    files = {}
    pipes = {}
    nonblocking = {'stdout': False, 'stderr': False}
    eof = {'stdout': False, 'stderr': False}
    retained = {'stdout': 0, 'stderr': 0}
    received = {'stdout': 0, 'stderr': 0}
    hashes = {'stdout': hashlib.sha256(), 'stderr': hashlib.sha256()}
    retention_closed = {'stdout': False, 'stderr': False}
    prior_signals = {}
    failed = False
    stop_requested = False
    term_latched = False
    term_requests = 0
    signal_observation = 'NOT_REQUESTED'
    signalling_forbidden = False
    safe_code = 'PRIVATE_CHILD_COMPLETED'
    identity = 'NOT_OBSERVED'
    observed_session = None
    observed_group = None
    identity_reads = 0
    group_probes = 0
    group_absence = 'NOT_OBSERVED'
    leader_polls = 0
    leader_code = None
    leader_poll_failed = False
    capture_cycles = 0
    drain_cycles = 0
    pipe_reads = 0

    def mark_failure(code):
        nonlocal failed, safe_code
        failed = True
        if safe_code == 'PRIVATE_CHILD_COMPLETED':
            safe_code = code

    def leader_poll():
        nonlocal leader_polls, leader_code, leader_poll_failed, signalling_forbidden
        if child is None or leader_poll_failed:
            return None
        if leader_polls >= MAX_LEADER_POLLS:
            leader_poll_failed = True
            signalling_forbidden = True
            mark_failure('LEADER_OBSERVATION_UNKNOWN')
            return None
        leader_polls += 1
        try:
            leader_code = child.poll()
            return leader_code
        except BaseException:
            leader_poll_failed = True
            signalling_forbidden = True
            mark_failure('LEADER_OBSERVATION_UNKNOWN')
            return None

    def send_once():
        nonlocal term_latched, term_requests, signal_observation, identity_reads, signalling_forbidden
        if (not stop_requested or child is None or term_latched or signalling_forbidden
                or identity != 'OBSERVED'):
            return
        term_latched = True  # Shared latch covers errors, root control and timeouts.
        if leader_poll() is not None or leader_poll_failed:
            return
        try:
            identity_reads += 1
            session_id = os.getsid(child.pid)
            identity_reads += 1
            group_id = os.getpgid(child.pid)
            if session_id != observed_session or group_id != observed_group or group_id != child.pid:
                signalling_forbidden = True
                signal_observation = 'IDENTITY_UNKNOWN'
                mark_failure('OWNED_IDENTITY_UNKNOWN')
                return
            term_requests = 1  # At most one syscall attempt; denial is never retried.
            child.send_signal(signal.SIGTERM)
            signal_observation = 'REQUESTED'
        except ProcessLookupError:
            signalling_forbidden = True
            signal_observation = 'TARGET_NOT_OBSERVED'
            mark_failure('OWNED_SIGNAL_UNKNOWN')
        except BaseException:
            signalling_forbidden = True
            signal_observation = 'DENIED_OR_UNKNOWN'
            mark_failure('OWNED_SIGNAL_UNKNOWN')

    def request_stop(code):
        nonlocal stop_requested
        mark_failure(code)
        stop_requested = True
        send_once()

    def root_signal(_number, _frame):
        try:
            request_stop('ROOT_STOP_REQUESTED')
        except BaseException:
            # Handler exceptions cannot escape into an unsanitized traceback.
            mark_failure('PRIVATE_RUNNER_FAILURE')

    def read_pipe(label):
        nonlocal pipe_reads
        if eof[label] or not nonblocking[label] or label not in pipes:
            return
        pipe_reads += 1
        try:
            block = os.read(pipes[label].fileno(), 8192)
        except BlockingIOError:
            return
        if not block:
            eof[label] = True
            if selector is not None:
                try:
                    selector.unregister(pipes[label])
                except KeyError:
                    pass
            pipes[label].close()
            return
        received[label] += len(block)
        kept = block[:max(0, STREAM_CAP - retained[label])]
        if kept:
            written = files[label].write(kept)
            if written != len(kept):
                raise ValueError('PRIVATE_CAPTURE_UNKNOWN')
            retained[label] += len(kept)
            hashes[label].update(kept)
        if received[label] > STREAM_CAP:
            request_stop('PRIVATE_STREAM_BOUND')

    try:
        output = capsule / 'private-process-output'
        output.mkdir(mode=0o700)
        for label in ['stdout', 'stderr']:
            descriptor = os.open(output / (label + '.bin'), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            try:
                files[label] = os.fdopen(descriptor, 'wb')
                descriptor = None
            finally:
                if descriptor is not None:
                    os.close(descriptor)
        for number in [signal.SIGINT, signal.SIGTERM]:
            prior_signals[number] = signal.signal(number, root_signal)
        selector = selectors.DefaultSelector()  # Exactly one allocation; no replacement on failure.
        if failed or stop_requested:
            raise ValueError('PRESPAWN_STOPPED')
        child = subprocess.Popen([str(NODE), '--no-warnings', str(capsule / 'entry.mjs')],
                                 cwd=capsule, stdin=subprocess.DEVNULL,
                                 stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=False,
                                 start_new_session=True,
                                 env={'DSH_HOME': str(capsule / 'private-run' / 'home'),
                                      'XDG_CONFIG_HOME': str(capsule / 'private-run' / 'xdg')})
        pipes = {'stdout': child.stdout, 'stderr': child.stderr}
        try:
            identity_reads += 1
            observed_session = os.getsid(child.pid)
            identity_reads += 1
            observed_group = os.getpgid(child.pid)
            if observed_session != child.pid or observed_group != child.pid:
                identity = 'MISMATCH'
                signalling_forbidden = True
                request_stop('OWNED_IDENTITY_UNKNOWN')
            else:
                identity = 'OBSERVED'
        except BaseException:
            identity = 'NOT_OBSERVED'
            signalling_forbidden = True
            request_stop('OWNED_IDENTITY_UNKNOWN')
        for label, stream in pipes.items():
            os.set_blocking(stream.fileno(), False)
            nonblocking[label] = True
            selector.register(stream, selectors.EVENT_READ, label)
        if stop_requested:
            send_once()
        while True:
            code = leader_poll()
            if all(eof.values()) and code is not None:
                break
            elapsed = time.monotonic() - started
            if elapsed >= WORK_SECONDS:
                request_stop('OUTER_WINDOW_UNKNOWN')
            if elapsed >= WORK_SECONDS + DRAIN_SECONDS:
                request_stop('LOCAL_DRAIN_UNKNOWN')
                break
            if capture_cycles >= MAX_CAPTURE_CYCLES:
                request_stop('PRIVATE_CAPTURE_WINDOW_UNKNOWN')
                raise ValueError('PRIVATE_CAPTURE_WINDOW_UNKNOWN')
            capture_cycles += 1
            ready = selector.select(timeout=min(0.25, WORK_SECONDS + DRAIN_SECONDS - elapsed))
            for key, _events in ready:
                read_pipe(key.data)
    except BaseException:
        request_stop('PRIVATE_RUNNER_FAILURE')
        # Bounded post-exception drain uses the same owned pipes and no second
        # selector. A stream whose nonblocking setup failed is never read here.
        try:
            drain_until = min(started + WORK_SECONDS + DRAIN_SECONDS, time.monotonic() + DRAIN_SECONDS)
            while child is not None and drain_cycles < MAX_EXCEPTION_DRAIN_CYCLES and time.monotonic() < drain_until:
                drain_cycles += 1
                for label in ['stdout', 'stderr']:
                    try:
                        read_pipe(label)
                    except BaseException:
                        mark_failure('PRIVATE_CAPTURE_UNKNOWN')
                        nonblocking[label] = False  # No failed capture/setup is retried.
                if leader_poll() is not None and all(eof.values()):
                    break
                time.sleep(min(0.1, max(0, drain_until - time.monotonic())))
        except BaseException:
            request_stop('PRIVATE_DRAIN_UNKNOWN')
    finally:
        # Every close/restore failure becomes a finite HOLD; no finally traceback.
        if selector is not None:
            try:
                selector.close()
            except BaseException:
                request_stop('PRIVATE_TEARDOWN_UNKNOWN')
        for label, stream in pipes.items():
            try:
                stream.close()
            except BaseException:
                request_stop('PRIVATE_TEARDOWN_UNKNOWN')
        for label, stream in files.items():
            try:
                stream.close()
                retention_closed[label] = True
            except BaseException:
                request_stop('PRIVATE_TEARDOWN_UNKNOWN')
        for number, previous in prior_signals.items():
            try:
                signal.signal(number, previous)
            except BaseException:
                request_stop('PRIVATE_TEARDOWN_UNKNOWN')

    if child is not None:
        leader_poll()
    if identity == 'OBSERVED':
        group_probes = 1
        try:
            os.killpg(observed_group, 0)  # Read-only existence probe; never a terminating group signal.
            group_absence = 'PRESENT'
            mark_failure('OWNED_GROUP_STILL_PRESENT')
        except ProcessLookupError:
            group_absence = 'ABSENT'
        except BaseException:
            group_absence = 'NOT_OBSERVED'
            signalling_forbidden = True
            mark_failure('OWNED_GROUP_UNKNOWN')
    else:
        mark_failure('OWNED_IDENTITY_UNKNOWN')
    local_drain = (child is not None and not leader_poll_failed and leader_code is not None
                   and all(eof.values()) and group_absence == 'ABSENT')
    if not local_drain:
        mark_failure('LOCAL_DRAIN_UNKNOWN')
    node_outcome = None
    outcome_observation = 'NOT_OBSERVED'
    if child is not None:
        try:
            node_outcome = outcome_record(capsule)
            outcome_observation = 'OBSERVED'
        except FileNotFoundError:
            mark_failure('CLOSED_OUTCOME_NOT_OBSERVED')
        except BaseException:
            outcome_observation = 'REFUSED'
            mark_failure('CLOSED_OUTCOME_REFUSED')
    scoped_goal = 'NOT_OBSERVED' if node_outcome is None else node_outcome['scopedGoal']
    if scoped_goal == 'FAIL':
        mark_failure('SCOPED_GOAL_FAIL')
    if child is not None and leader_code != 0:
        mark_failure('PRIVATE_CHILD_HOLD')
    node_success = (node_outcome is not None and node_outcome['outcome'] == 'original-sequence-observed'
                    and node_outcome['completedOriginalSequence'] is True and scoped_goal == 'PASS'
                    and node_outcome['cleanup'] == 'public-disposers-resolved'
                    and node_outcome['failureCode'] is None and node_outcome['auditReads'] == 11
                    and node_outcome['adapterActive'] is False and node_outcome['adapterUncertainHold'] is False
                    and node_outcome['rootOwnerDisposeCalls'] == 1 and node_outcome['presetOwnerDisposeCalls'] == 1)
    if not node_success:
        mark_failure('CLOSED_OUTCOME_HOLD')
    if not all(retention_closed.values()):
        mark_failure('PRIVATE_RETENTION_UNKNOWN')
    streams = {}
    for label in ['stdout', 'stderr']:
        complete = eof[label]
        streams[label] = {'retainedPrefixBytes': retained[label],
                          'retainedPrefixSha256': hashes[label].hexdigest(),
                          'retentionClosed': retention_closed[label], 'receivedAtLeastBytes': received[label],
                          'eofObserved': complete, 'receivedCompleteness': 'COMPLETE' if complete else 'NOT_OBSERVED',
                          'truncation': 'KNOWN_TRUE' if received[label] > retained[label] else
                                        'KNOWN_FALSE' if complete and retention_closed[label] else 'NOT_OBSERVED'}
    reported = safe_emit(safe_code, exitCode=leader_code,
                         childPid=None if child is None else child.pid,
                         childStillAliveObservation='NOT_OBSERVED' if leader_poll_failed or child is None else
                                                   'ALIVE' if leader_code is None else 'EXITED',
                         ownedIdentityObservation=identity, observedSessionId=observed_session,
                         observedProcessGroupId=observed_group, ownedGroupAbsence=group_absence,
                         identityReadAttempts=identity_reads, groupExistenceProbes=group_probes,
                         gracefulSignalRequests=term_requests, signalObservation=signal_observation,
                         signallingForbidden=signalling_forbidden, leaderPolls=leader_polls,
                         captureCycles=capture_cycles, exceptionDrainCycles=drain_cycles, pipeReadAttempts=pipe_reads,
                         elapsedMs=round((time.monotonic() - started) * 1000), streams=streams,
                         localDrainObserved=local_drain, localProcessSuccess=not failed and local_drain and leader_code == 0,
                         scopedGoal=scoped_goal, closedOutcomeObservation=outcome_observation, nodeOutcome=node_outcome,
                         remoteNativeTerminationFromLocalExit='unproved', unexpectedEscapedDescendants='NOT_OBSERVED')
    return 0 if reported and not failed and local_drain and leader_code == 0 and node_success else 2


if __name__ == '__main__':
    # Includes main setup, bounded drain, teardown and reporter errors. Never
    # publish an arbitrary exception, traceback, raw Node stream or retry.
    try:
        result = main()
    except BaseException:
        safe_emit('PRIVATE_RUNNER_FAILURE')
        result = 2
    raise SystemExit(result)
