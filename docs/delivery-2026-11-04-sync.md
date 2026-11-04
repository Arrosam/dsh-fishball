# 模型刷新、手动提供商同步与气泡修复联合交付

## 组合范围

交付分支 `delivery/2026-11-04-sync` 基于 `3add93a183b8f9338a64f4ae9cbb0fe5def259b0`（含前次live `312ff1175005` 的三个修复与未安装的气泡修复）。只整合两个指定feature相对 `dfdb5a64` 的单一增量：

| 输入 | 整合提交 | 内容 |
|---|---|---|
| `a9f10a1db841751659d0440e15ca1e9f546fd9ec` | `229fca8fb2c42124f05351a8f5c22a6684d16925` | 刷新当前配置模型列表，保留已保存/当前选择 |
| `49b6a5ce9d1193aa231272f7fac321aa58ae91c1` | `9ddcac4528138edabe6db1274e094982c2f22f7e` | 仅owner页面手动配对、预览和确认新增纯API-key提供商记录 |

生产代码与incoming实现保持一致；唯一人工生产冲突处理是client两语种i18n机械并集：保留refresh的modelUnavailable、原样加入sync独立标签。`git merge-file`重建批准预期并与整份client逐字相同，恰为两处i18n hunk，未改DESIGN或任何生产逻辑。

## 明确授权的三个 test-support 差异

1. **test/support/dedicated-model-client.mjs**：保留options容器、原fetch在URL解析后全权接管（undefined也不回退）、request-body捕获边界；另命名interceptFetch在URL解析前仅同步undefined时回退（Promise(undefined)不回退）。保留script、module-id过滤、motion、document事件、snapshot、reload/Abort、cleanup/unmount/remount。第二轮把locale作为同一容器字段并按locale→en→key回退；pending POST回复改FIFO，reply/reject取最早请求，单pending与旧reply兼容。
2. **test/support/model-list-refresh.mjs**：仅唯一clientHarness调用点的选项字段fetch→interceptFetch。CatalogTransport及文件其余内容不变。
3. **test/support/host.mjs**：只在parent已设置FBTEST_DSH_RUNTIME时原值转发child env；其余env、显式per-test env覆盖优先级不变。**未设置时仍保留历史rc.2默认**，没有为了验收改默认值。本轮明确选择已安装rc.3，因此parent和bootHost child均实际使用rc.3。

没有修改任何suite文件或断言。第一轮119个、第二轮126个suite逐字匹配各自基线/原feature git blob，镜像相同；所有获准support及client也逐字与测试镜像相同。

## 隔离验证与审查

- 第一轮：19文件，318/318通过，0skip，exit0，192.9s。
- 第二轮：旧19+全部7sync，共26文件，481/481通过，0skip，exit0，195.3s。单pending旧suite原样通过，新FIFO/reject的同步suite同时通过。
- 整合生产模块语法及diff-check通过。
- 全量：独立精确9ddcac4 worktree、原test/run.mjs全126文件，2570 tests、2563通过、4失败、3跳过，301 suites，856.45s，原始exit1；不是全绿。失败全属既有PTC嵌套调用：PTC-01/02明确sandbox-unavailable / sandbox_apply Operation not permitted；PTA-01与PTC-03为inner request未到达断言（独立检查本轮fixture日志以进一步分类，暂不冒称同因）。无refresh/sync/bubble聚焦回归。3个原有skip未改条件；无peer/import/npm-cache失败。
- 独立helper/i18n reviewer核对两轮三stage、caller、完整差异、原blob范围，无阻塞。独立fixture安全代理核对全部新增sync测试与full的178个mjs外部副作用路径。独立生产安全reviewer核对service/channel/host/engine/coordinator/index/UI和官方rc.3 SDK，无确认的blocking security finding。

每次测试使用新的空cwd和env-i，HOME/DSH_HOME/agents/tmp独立，所有入口绝对路径；依赖只读链接现有rc.3 node_modules，不装peers，不读取repo/live.env。runner不与acceptance共用test-home根。七sync suite仅generated fake records、显式disposable credential store、空launchEnvironment、自己新建127.0.0.1:0双方fixture；绝不连接真实DSH。旧host不转外层TMPDIR/agents时仍使用新HOME/.agents或OS临时目录，不声称所有child复用外层tmp。

## 安装授权与真实同步边界

安装只使能力可用。新增sync注册/HMR/组件mount/status不初始化host/listener或读取provider/key，只有owner明确invite/begin才启动。API复用官方owner principal网关，无agent tool/@Remote入口；preview不读取key，confirm须独立同意+selected-only+peer/fingerprint/revision等检查。

**本轮禁止真实配对、provider记录抽取或API-key转移；第一次真实转移必须由用户另行批准。** 确认后的SDK全局modelCatalog校验可能解析其他route的credential reference，不能称为零凭据读取；此路径不在安装/idle触发，首次真实操作前需向用户说明。跨存储非事务、config-first窗口、source当前key无CAS、开始的SDK写不可撤回、credential-local明文0600等设计限制保留。

安全备份仅获准五项profile原字节cp-p及旧Fishball tar，存在新git-ignored `.runtime/delivery-backup-20261104T041035Z`；不打印、解析、grep或diff live cordis.patch内容，不读拷credential/secret store，不提交/上传/移动备份。后续patch重载只追加一条交付SHA注释并验证bytes=cp-p备份+后缀。

打包与安装都使用--ignore-scripts，官方rc.3 wrapper+显式两个home/web profile；不restart/push/publish。安装后两套原页面都需 **Cmd+Shift+R 强制刷新**。逐文件SHA与raw patch bytes校验和运行态/UI验收是不同证据，HMR无错误不代表成功已被正向认证；真实浏览器气泡行数/窄屏像素亦未验收。
