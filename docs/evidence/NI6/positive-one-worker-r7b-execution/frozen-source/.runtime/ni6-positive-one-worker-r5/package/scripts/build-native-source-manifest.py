# SOURCE ONLY. Future root build GO must first build the actual client.
# Measures actual final package/source/build and exact original peer bytes;
# never fabricates a provisional stableSourceRef. No imports of product/host JS.
import argparse, hashlib, json, pathlib, os
HOST_FILES = {'@deepseek-ai/cordis-plugin-loader': ['lib/index.js', 'lib/types/index.d.ts', 'package.json'], '@deepseek-ai/cordis': ['lib/index.js', 'lib/types/index.d.ts', 'lib/types/reflect.d.ts', 'package.json'], '@deepseek-ai/dsh-agent-loop': ['lib/index.js', 'lib/types/index.d.ts', 'package.json'], '@deepseek-ai/dsh-agent-preset-registry': ['lib/index.js', 'lib/types/index.d.ts', 'package.json'], '@deepseek-ai/dsh-agent': ['lib/index.js', 'lib/types/index.d.ts', 'lib/types/index.js', 'package.json'], '@deepseek-ai/dsh-brand': ['lib/index.js', 'lib/types/index.d.ts', 'package.json'], '@deepseek-ai/dsh-client-connection': ['lib/index.js', 'lib/types/index.d.ts', 'package.json'], '@deepseek-ai/dsh-client-ui-layout': ['lib/index.js', 'lib/types/index.d.ts', 'package.json'], '@deepseek-ai/dsh-client-ui-renderer': ['lib/index.js', 'lib/types/index.d.ts', 'package.json'], '@deepseek-ai/dsh-client-ui-sidebar': ['lib/index.js', 'lib/types/index.d.ts', 'package.json'], '@deepseek-ai/dsh-client-ui-workspace': ['lib/index.js', 'lib/types/index.d.ts', 'package.json'], '@deepseek-ai/dsh-host-webserver': ['lib/index.js', 'lib/types/index.d.ts', 'package.json'], '@deepseek-ai/dsh-llm': ['lib/index.js', 'lib/types/index.d.ts', 'lib/types/index.js', 'package.json'], '@deepseek-ai/dsh-scope': ['lib/index.js', 'lib/types/index.d.ts', 'package.json'], '@deepseek-ai/dsh-session-persistence-jsonl': ['lib/index.js', 'lib/types/index.d.ts', 'package.json'], '@deepseek-ai/dsh-session-persistence': ['lib/index.js', 'lib/types/index.d.ts', 'package.json'], '@deepseek-ai/dsh-session-projection': ['lib/index.js', 'lib/types/index.d.ts', 'package.json'], '@deepseek-ai/dsh-session': ['lib/index.js', 'lib/types/index.d.ts', 'package.json', 'lib/types/surface.js', 'lib/types/surface.d.ts', 'lib/types/types.js', 'lib/types/known-event-types.js'], '@deepseek-ai/dsh-system-prompt': ['lib/index.js', 'lib/types/index.d.ts', 'package.json'], '@deepseek-ai/dsh-token-meter': ['lib/index.js', 'lib/types/estimate.js', 'lib/types/index.d.ts', 'package.json'], '@deepseek-ai/dsh-tools': ['lib/index.js', 'lib/types/index.d.ts', 'package.json'], '@deepseek-ai/dsh-util-values': ['lib/index.js', 'lib/types/index.d.ts', 'package.json'], '@deepseek-ai/dsh-user-approval': ['lib/index.js', 'lib/types/index.d.ts', 'package.json'], '@deepseek-ai/dsh-web-app': ['lib/index.js', 'lib/types/index.d.ts', 'package.json'], '@deepseek-ai/dsh': ['lib/bin.js', 'package.json'], '@deepseek-ai/node-addon-system-darwin-arm64': ['bin/system.node', 'package.json'], '@deepseek-ai/node-addon-system': ['lib/flock.js', 'lib/index.js', 'package.json']}
def digest(path):
    if path.resolve()!=path.absolute() or not path.is_file():
        raise ValueError('SOURCE_MANIFEST_PATH_INVALID')
    return hashlib.sha256(path.read_bytes()).hexdigest()
def generate(product_root,host_root):
    product_root=product_root.resolve();host_root=host_root.resolve()
    metadata=json.loads((product_root/'package.json').read_text())
    if metadata['name']!='dsh-fishball':raise ValueError('SOURCE_MANIFEST_PACKAGE_INVALID')
    # Historical unused replacement hooks stay inert and are not exported or imported.
    sources=sorted(p for p in (product_root/'src').iterdir() if p.is_file() and p.name!='normal-native-hooks.mjs')
    if any('normal-native-hooks.mjs' in p.read_text() for p in sources):raise ValueError('SOURCE_MANIFEST_UNREVIEWED_HOOK_IMPORT')
    paths=sources+[product_root/p for p in ['package.json','scripts/dsh-web-runtime-lock.json','scripts/build-client.mjs','scripts/build-native-source-manifest.py','lib/client.js']]
    if len(paths)>64 or len(paths)!=len(set(paths)):raise ValueError('SOURCE_MANIFEST_PRODUCT_LIMIT')
    product_files=sorted([{'path':str(p.relative_to(product_root)),'digest':digest(p)} for p in paths],key=lambda row:row['path'])
    modules=[]
    for name,files in sorted(HOST_FILES.items()):
        base=host_root/'node_modules'/name;peer=json.loads((base/'package.json').read_text())
        if peer['name']!=name or len(files)>32:raise ValueError('SOURCE_MANIFEST_HOST_INVALID')
        modules.append({'name':name,'version':peer['version'],'files':[{'path':p,'digest':digest(base/p)} for p in files]})
    if len(modules)>32:raise ValueError('SOURCE_MANIFEST_HOST_LIMIT')
    dsh=json.loads((host_root/'node_modules/@deepseek-ai/dsh/package.json').read_text())
    if dsh['version']!='0.2.1-alpha.1':raise ValueError('SOURCE_MANIFEST_HOST_VERSION')
    return {'contractVersion':'df.native-source/v1','host':{'version':dsh['version'],'lockDigest':digest(host_root/'package-lock.json'),'modules':modules},'product':{'name':metadata['name'],'version':metadata['version'],'files':product_files}}
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--product-root',required=True);parser.add_argument('--host-root',required=True);args=parser.parse_args()
    product=pathlib.Path(args.product_root).resolve();out=generate(product,pathlib.Path(args.host_root))
    payload=(json.dumps(out,sort_keys=True,separators=(',',':'),ensure_ascii=False)+'\n').encode()
    target=product/'native-source-manifest.json';temporary=product/('native-source-manifest.'+str(os.getpid())+'.tmp')
    with temporary.open('xb') as handle:handle.write(payload)
    temporary.replace(target)
