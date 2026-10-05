from pathlib import Path, PurePosixPath
import gzip, hashlib, io, json, tarfile, textwrap

REPO = Path(__file__).resolve().parents[2]
SOURCE = REPO / '.runtime/ni2-install/artifact/dsh-fishball-0.1.0-preview.1.tgz'
BASE = REPO / '.runtime/private-cloud-transfer-a58c522-final'
REVISION = 'a58c522f32dd2be2ec29a697ec32ed295e154614'
ORIGINAL_HASH = 'fa3fb398d901a5c3d04d1f6f949878eb190f1d1fb737b16210347963d0afb5c0'
TOP = 'dsh-fishball-a58c522-private-linux-test-bundle'

def sha(data):
    return hashlib.sha256(data).hexdigest()

assert sha(SOURCE.read_bytes()) == ORIGINAL_HASH
if BASE.exists():
    raise SystemExit('TRANSFER_OUTPUT_ALREADY_EXISTS')
BASE.mkdir(mode=0o700)
contents = {}
excluded = []
root_files = {'package.json', 'README.md', 'AGENTS.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', '.gitattributes'}
portable_docs = {'compatibility.md', 'runtime-api.md', 'runtime-installation.md', 'fishball-provenance.md', 'normal-memory-continuity-contract.md', 'normal-entry-integration-plan.md', 'development-workflow.md', 'three-stage-development.md'}
with tarfile.open(SOURCE, 'r:gz') as archive:
    for member in archive.getmembers():
        parts = PurePosixPath(member.name).parts
        if not parts or parts[0] != 'package' or any(p in {'.', '..'} for p in parts):
            raise SystemExit('UNSAFE_ORIGINAL_MEMBER')
        relative = PurePosixPath(*parts[1:])
        selected = member.isfile() and (str(relative) in root_files or parts[1] in {'src', 'lib', 'scripts', 'test'} or len(parts) == 3 and parts[1] == 'docs' and parts[2] in portable_docs)
        if not selected:
            excluded.append(member.name)
            continue
        if member.issym() or member.islnk() or any(p in {'node_modules', '.git', '.runtime', '.aws', '.codex', '.agents', 'private', 'df-data'} for p in parts):
            raise SystemExit('FORBIDDEN_MEMBER')
        data = archive.extractfile(member).read()
        data.decode('utf-8')  # This bundle contains portable text code/assets only.
        if data.startswith(b'SQLite format 3\0') or data[:4] in {b'\x7fELF', b'\xcf\xfa\xed\xfe', b'\xfe\xed\xfa\xcf'}:
            raise SystemExit('BINARY_OR_DATA_MEMBER')
        contents['package/' + str(relative)] = data

host = REPO / '.runtime/ni2-install/host'
for name in ['package.json', 'package-lock.json']:
    data = (host / name).read_bytes()
    parsed = json.loads(data)
    assert not any(s in data for s in [b'_authToken', b'_password', b'Authorization:', b'/Users/'])
    contents['host/' + name] = data
assert sha(contents['host/package-lock.json']) == '68d3847884edf5b2c21d9d254bc059c3beb8105baec50c6d637c3328bbf187a3'

contents['fixtures/prepare-synthetic-profile.py'] = textwrap.dedent('''\
    # Fresh synthetic fixture only. No previous profile/data/credential is read.
    import argparse, json, os
    from pathlib import Path
    parser = argparse.ArgumentParser()
    parser.add_argument('--worker', action='store_true', help='Mac ARM64 native worker only; Linux capability is unverified')
    args = parser.parse_args()
    bundle = Path(__file__).resolve().parents[1]
    base = bundle / 'synthetic-fixture'
    if base.exists():
        raise SystemExit('FIXTURE_ALREADY_EXISTS')
    for relative in ['home/profiles/web', 'workspace', 'agents', 'private', 'evidence']:
        (base / relative).mkdir(parents=True, mode=0o700)
    profile = base / 'home/profiles/web'
    manifest = {'name':'df-private-synthetic-profile','private':True,'dependencies':{},'dsh':{'profile':{'bundles':['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app']}}}
    (profile / 'package.json').write_text(json.dumps(manifest, indent=2)+'\\n')
    (profile / 'cordis.yml').write_text('[]\\n')
    patch = [
      {'id':'web-runtime','config':{'openBrowser':False,'printUrl':False,'surfaceContext':False,'trustedHosts':[]}},
      {'id':'connection','inject':['webServer'],'config':{'trustedHosts':[]}},
      {'id':'credentials','config':{'path':str(base/'private/browser-auth.yml'),'dshHome':str(base/'home'),'watch':False}},
      {'id':'session-persistence-jsonl','config':{'root':str(profile/'df-data/df-sessions'),'compression':'none'}},
      {'id':'agent-loop','config':{'agents':[],'maxParallelToolCalls':1}},
      {'id':'agent-preset-registry','config':{'default':'df-ni2-empty'}},
      {'id':'agent-default-model','config':{'provider':'df-testing-local','model':'df-testing-worker-v1'}},
      {'id':'system-prompt','config':{'personaPrefix':'','personaSuffix':''}},
      {'id':'tools','config':{'mode':'native'}},
      {'id':'approval','config':{'policy':'never'}},
      {'id':'permission','config':{'presets':{'df-read-only':{'sandbox':'read-only','approval':'never','name':'df-read-only','description':'Synthetic isolated profile: read-only, no escalation'}},'defaultPreset':'df-read-only'}},
    ]
    for name in ['llm-deepseek','llm-deepseek-account','llm-pi-ai','deepseek-account','account-controller','session-title-llm','llm-retry','otel','session-telemetry-otel','desktop-product-telemetry','product-analytics','goal-round-driver','compaction-basic','command-compact','tool-result-pruner','image-offload','agent-instructions','skill-filesystem','preset-minimal','preset-standard','preset-ptc','preset-cordis','web-search-deepseek','web-fetch-http','schedule','ui-schedule']:
        patch.append({'id':name,'disabled':True})
    config = {'databasePath':str(profile/'df-data/runtime.sqlite'),'memory':{'enabled':True,'byteLimit':65536,'tokenLimit':8192},'limits':{'maxMetadataBytes':4096},'worker':{'enabled':False}}
    if args.worker:
        config['worker'] = {'enabled':True,'selection':{'provider':'df-testing-local','model':'df-testing-worker-v1','agentPreset':'df-ni2-empty','reasoningEffort':None,'maxOutputTokens':128},'environment':{'root':str(base/'workspace'),'cwd':str(base/'workspace')},'persistence':{'directory':str(profile/'df-data/df-sessions'),'compression':'none','retention':'owner-managed'},'bounds':{'requestBytes':8192,'resultBytes':128},'policy':{'maxRuntimeMs':10000,'maxUsageUnits':20000,'maxCostEstimateMicros':0},'charges':{'runtimeMs':1000,'usageUnits':8320},'previewTtlMs':30000,'grantTtlMs':60000}
    entries = [{'id':'preset-df-ni2-empty','name':'@deepseek-ai/dsh-agent-preset','config':{'id':'df-ni2-empty','description':'Synthetic empty preset','plugins':[]}},{'id':'df-testing-provider','name':'dsh-fishball/testing-provider','config':{}},{'id':'df-installed','name':'dsh-fishball/installed','config':config}]
    patch.append({'insert':entries})
    (profile/'cordis.patch.yml').write_text(json.dumps(patch,indent=2)+'\\n')
    # Product resolves the exact original flat host through normal peer paths.
    package_peers=bundle/'package/node_modules'
    if package_peers.exists():
        raise SystemExit('SOURCE_PEER_DIRECTORY_ALREADY_EXISTS')
    package_peers.mkdir(mode=0o700)
    (package_peers/'@deepseek-ai').symlink_to(bundle/'host/node_modules/@deepseek-ai',target_is_directory=True)
    (profile/'node_modules').mkdir(mode=0o700)
    (profile/'node_modules/dsh-fishball').symlink_to(bundle/'package',target_is_directory=True)
    print(json.dumps({'fixture':str(base),'workerEnabled':args.worker,'privateCredentialCreated':False,'models':'synthetic only','hostStarted':False}))
    ''').encode()

contents['fixtures/start-original-web.mjs'] = textwrap.dedent('''\
    // Launches only the original pinned CLI, with fresh owned fixture paths.
    import { spawn } from 'node:child_process';
    import { existsSync, realpathSync } from 'node:fs';
    import { dirname, join } from 'node:path';
    import { fileURLToPath } from 'node:url';
    if (process.version !== 'v22.22.2') throw Error('RUNTIME_UNSUPPORTED');
    const bundle=fileURLToPath(new URL('../',import.meta.url)),base=join(bundle,'synthetic-fixture');
    for(const name of ['home','workspace','agents','private','evidence'])if(realpathSync(join(base,name))!==join(base,name))throw Error('NONCANONICAL_FIXTURE');
    for(const name of ['home','workspace'])if(existsSync(join(base,name,'.env')))throw Error('FIXTURE_ENV_NOT_EMPTY');
    const cli=join(bundle,'host/node_modules/@deepseek-ai/dsh/lib/bin.js');
    if(!existsSync(cli))throw Error('PINNED_HOST_NOT_INSTALLED');
    const child=spawn(process.execPath,[cli,'--profile','web','--host','127.0.0.1','--port','3080','--no-open'],{cwd:join(base,'workspace'),env:{PATH:dirname(process.execPath)+':/usr/bin:/bin',DSH_HOME:join(base,'home'),DSH_AGENTS_HOME:join(base,'agents'),DSH_TELEMETRY_DISABLED:'1',DSH_PERMISSION_MODE:'read-only'},stdio:['ignore','pipe','pipe']});
    let stdoutBytes=0,stderrBytes=0;child.stdout.on('data',data=>{stdoutBytes+=data.length;});child.stderr.on('data',data=>{stderrBytes+=data.length;});
    console.log(JSON.stringify({originalCLI:true,pid:child.pid,url:'http://127.0.0.1:3080',browserOpened:false}));
    for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
    child.on('error',()=>{console.error('ORIGINAL_CLI_START_FAILED');process.exitCode=1;});
    child.on('exit',(code,signal)=>{console.log(JSON.stringify({code,signal,stdoutBytes,stderrBytes}));process.exitCode=code??1;});
    ''').encode()

contents['LINUX-TEST-HANDOFF.md'] = textwrap.dedent('''\
    # Private a58c522 Linux test handoff

    This is a private source/package transfer, not publication or MVP acceptance.
    Frozen revision: a58c522f32dd2be2ec29a697ec32ed295e154614.
    Original runnable Mac package SHA-256: fa3fb398d901a5c3d04d1f6f949878eb190f1d1fb737b16210347963d0afb5c0.
    All included package source, tests and compiled client bytes match that archive.
    Current source6/NI3 development changes are deliberately separate and not in this snapshot.

    The archive includes portable text code/assets, synthetic test sources, MIT/notices,
    exact official DSH Web 0.2.1-alpha.1 host package and lock, and fresh fixture recipes.
    It excludes node_modules, compiled platform binaries, Git history, private runtime files,
    owner task/memory/session databases or transcripts, credentials/keys/cookies/logs,
    old synthetic database fixtures and historical evidence/review/owner-instruction documents.
    MANIFEST.json lists every included byte hash. VERIFY.json records structural checks only.

    ## Linux status and bounded shell checks

    Linux execution has NOT been performed for this transfer. Use exactly Node22.22.2.
    No Node/npm binary is bundled. Do not use Mac-specific scripts/host setup helpers on Linux.
    The pinned native worker checks darwin/arm64 persistence support; expect truthful capability
    refusal on Linux until a separate verified host-portability change is approved.
    Do not edit platform/source/class/hash/permission gates to make a test pass.
    Foundation/ledger/memory/context portability can be tested without external inference.
    Review the chosen test's imports/effects first; no blanket suite or denied action bypass.

    From package/, examples of bounded portable checks for the consumer to authorize/run:
      node --version
      node scripts/check.mjs
      node --test test/memory.test.mjs test/context.test.mjs
    Other native-dependent tests need the actual original dependency graph and may be blocked.
    Preserve exact first stdout/stderr/exit, target Node/OS/architecture, and expected blocked cases.

    ## Optional official host installation and fresh profile

    In host/, use the provided package.json and exact package-lock.json unchanged.
    Install only after consumer runtime policy permits the downloaded official graph:
      npm ci --ignore-scripts --no-audit --no-fund
    Use isolated temporary npm config/cache and the public npm registry, not personal npm config.
    This command downloads dependencies; this transfer did not install or execute them on Linux.
    No lifecycle scripts or dependencies from unreviewed alternatives are authorized.
    Lock SHA-256 must remain 68d3847884edf5b2c21d9d254bc059c3beb8105baec50c6d637c3328bbf187a3.

    From the bundle directory, run the source-reviewed recipe when allowed:
      python3 fixtures/prepare-synthetic-profile.py
    Default worker is disabled for Linux compatibility observation. This creates a new isolated
    synthetic-fixture and normal peer links, never reads owner data or creates a credential.
    The --worker option supplies the exact previously runnable Mac synthetic worker choices;
    Linux worker support remains unverified and currently guarded. Do not use that switch as
    a way to override a capability refusal. Setup and policy/action decisions remain explicit.
    Retain an existing fixture as evidence; never overwrite it to erase a failure.

    If original loopback CLI start is authorized and port3080 is free:
      node fixtures/start-original-web.mjs
    This launches original host/node_modules/@deepseek-ai/dsh/lib/bin.js with
    --profile web --host127.0.0.1 --port3080 --no-open and minimal owned environment.
    Host output is reduced to byte counts because raw native logs may contain credentials.
    The profile uses original AuthService/LocalCredentialProvider with a new private path.
    Authentication/setup may require fresh synthetic grants through supported original interfaces;
    none are supplied. Do not borrow Mac/profile/owner credentials. Keep generated secrets private.
    Quit the owned wrapper with SIGTERM/SIGINT and verify original CLI/listener disposal.

    Synthetic provider is the unchanged source-owned dsh-fishball/testing-provider export:
    df-testing-local / df-testing-worker-v1, deterministic text, empty tools, zero external cost.
    It needs the actual original classes/source/lock/private one-use request permit; directly
    calling a mock callback or supplying a provider label does not establish original execution.
    No live model/account/webhook/chat, owner data, paid inference or publication is authorized.

    This transfer does not resolve the previously blocked cloud loopback browser restriction.
    Use only supported browser tools and report exact blocked/not-run outcomes. No alternative
    port/alias/proxy/CDP/environment bypass or fixture-only UI PASS. All87 acceptance criteria
    remain unaccepted; existing final independent CODE gap remains separate and blocked.
    ''').encode()

for required in ['package/test/memory.test.mjs', 'package/test/context.test.mjs', 'package/scripts/check.mjs', 'package/src/testing-provider.mjs', 'package/lib/client.js']:
    assert required in contents
rows = [{'path':name,'bytes':len(data),'sha256':sha(data),'origin':'exact frozen package' if name.startswith('package/') else 'exact pinned host manifest/lock' if name.startswith('host/') else 'new transfer-only recipe/instructions'} for name,data in sorted(contents.items())]
manifest = {'formatVersion':'df.private-linux-transfer/v1','revision':REVISION,'originalMacArchiveSha256':ORIGINAL_HASH,'originalHostLockSha256':sha(contents['host/package-lock.json']),'productChanged':False,'rows':rows,'excludedOriginalMembers':len(excluded),'linuxRun':False,'browserRestrictionResolved':False,'acceptedCount':0}
contents['MANIFEST.json']=(json.dumps(manifest,indent=2)+'\n').encode()
verify = {'formatVersion':'df.private-linux-transfer-structural-check/v1','includedProductFilesMatchFrozenArchive':True,'allMembersRegularUtf8Text':True,'pathTraversalLinksNodeModulesGitPrivateRuntimeAndDatabaseFilesExcluded':True,'platformBinariesExcluded':True,'all87CriteriaUnaccepted':True,'fixtureGeneratedButNotExecuted':True,'nodeSyntaxProductTestsHostLinuxAndBrowserActionsRun':False,'includedCountBeforeManifestAndVerification':len(rows)}
contents['VERIFY.json']=(json.dumps(verify,indent=2)+'\n').encode()
output=BASE/(TOP+'.tgz')
with output.open('wb') as stream:
    with gzip.GzipFile(filename='',mode='wb',fileobj=stream,mtime=0) as compressed:
        with tarfile.open(fileobj=compressed,mode='w',format=tarfile.PAX_FORMAT) as archive:
            for name,data in sorted(contents.items()):
                info=tarfile.TarInfo(TOP+'/'+name);info.size=len(data);info.mode=0o644;info.mtime=0;info.uid=info.gid=0;info.uname=info.gname=''
                archive.addfile(info,io.BytesIO(data))
with tarfile.open(output,'r:gz') as archive:
    members=archive.getmembers();assert len(members)==len(contents)
    for member in members:
        assert member.isfile() and not member.issym() and not member.islnk()
        name=member.name[len(TOP)+1:];assert sha(archive.extractfile(member).read())==sha(contents[name])
result={'localPath':str(output),'filename':output.name,'sha256':sha(output.read_bytes()),'bytes':output.stat().st_size,'memberCount':len(contents),'revision':REVISION,'productFiles':sum(name.startswith('package/') for name in contents),'privateDataIncluded':False,'nodeModulesIncluded':False,'platformBinaryIncluded':False,'linuxExecution':False}
(BASE/'bundle-result.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
