# 模型、提供商与 API key 的手动同步设计（v1 已批准）

状态：**用户已批准 v1 实现；开发/测试仅限 SDK 夹具与 disposable DSH_HOME，真实同步仍需另行提交用户批准**。刷新列表是独立只读功能，不需要批准任何凭据传输。本调查只读仓库及已安装 DSH rc.3 的 SDK/程序源码，未读取真实配置、环境变量、密钥文件或 API key。

> **0.1.0-alpha.0 现状。** 本设计中的“两端页面配对”流程（邀请/pair capability、独立 loopback 通道、10 秒 deadline）未按此实现：child 由本 host 启动并拥有，provider 同步走生命周期线上的 host 端 “Model for Fishball” Check → Add 块，无配对。§2/§6.3 说 “不支持 reference/ambient 认证复制” 也已变化：`apiKeyEnv` 引用先在来源环境解析成值，再作为普通 API-key record 复制（2026-11-06 用户决定）。

## 1. 当前能力与隔离方案

- 现在专用模型设置只保存 `provider/model/reasoningEffort?` 选择；这不是提供商定义，也不包含 API key。[模型选择](<../src/model-selection.js>)、[选择记录](<../src/store.js#L69-L75>)。
- 主 DSH 已启用的插件实例/模型服务仍然共用。Fishball 自装或私有插件可有自己的配置覆盖，但当前没有通用的独立模型账户仓库；必须按实际配置所有者清点，不能把“专用选择”当成可导出的提供商。[私有插件设置](<../src/plugin-settings.js#L1-L17>)、[shared 判定](<../src/plugin-catalog.js#L824-L837>)。
- 新隔离方案（用户转达，尚未批准）使用同一 DSH 安装的另一个标准进程，独立 home/profile/config/credentials/plugins/sessions/env/用户目录和 Web 页面；原生加载模型插件、单独登录，**不使用模型桥、不复制 OAuth/token**。本方案以它为准，而不是旧的 [隔离调查](<runtime-isolation.md>) 中的模型桥建议。
- 抽象为“来源 runtime/profile → 目标 runtime/profile”。运行实例身份、home/profile 身份、配置 schema/版本都必须明确；同一个实际 profile 直接预览“同一配置，无需同步”，不解析或传输密钥，不写任何内容。
- 单次、显式授权的配置/密钥迁移不是持续共享。不能把新隔离方案的会话/审批控制通道默认扩展为凭据通道；用户已批准独立的手动同步能力，不能给原会话桥增加权限。

## 2. DSH 已有接口：可用范围与限制

以下名称均来自 rc.3 正式契约，不是拟造接口。安装 SDK 根目录为 `node_modules/@deepseek-ai/`。

| 用途 | 现有服务/API | 限制 |
| --- | --- | --- |
| 可选择模型 | host `sessionController.modelCatalog()` / client `remote.session.modelCatalog()` | 与 DSH 原生模型选择器同源；实时可路由目录不是完整配置导出。空组/缺密钥/提供商失败可能使条目不出现。 |
| 提供商清点 | `remote.llm.listProviders()`、`listConfigurableProviders()` | 从目录取得真实 `settingsNs/settingsPath`；不假设所有插件都用同一命名空间。 |
| 候选模型发现 | `remote.llm.discoverModels(settingsNs, request, signal?)` | 发现不是保存；不代表可以导出来源认证。 |
| 非密钥配置 | `settings.describe({redactSecrets:true})` / remote describe；`settings.mutate(ns, ops, expectedRevision)` | 最小路径新增 + 明确 revision。没有通用 `addProvider` RPC，不能用遮罩后的整份配置 replace。 |
| 浏览器密钥操作 | `remote.credentials.describe(refs)`、`set(ref,value)`、`unset(ref)` | 只返回 presence/source/writable；没有 read/export/import/create-if-absent。 |
| 受信 host 密钥接口 | `CredentialProvider.resolve(ref)`、`readRecord(key)`、`describeRecord/listRecords`、`modifyRecord(key, mutate)` | 只能在获准后由所有者处理。record 路径可在锁内拒绝已存在项；不能泛化为任意引用/ambient/OAuth 的安全迁移。 |

通常自定义提供商由 DSH GUI 通过 `settings.mutate('llm-pi-ai', [{op:'set',path:['providers',route],value:profile}], revision)` 创建，再单独 `credentials.set`；两步并非事务。profile 可包含协议、baseURL、显示名、模型覆盖、API-key 引用等；引用/普通配置由 DSH ConfigEditor 持久化到 profile composition patch，同步代码不得直接改 YAML 或复制整个 patch。

密钥值由 credential provider 管理。**默认官方 credentials-local 以 owner-only 的明文 YAML 持久化，不是加密存储**；引用会在 provider-managed 值、进程环境、项目/用户环境等来源中解析。API-key record 还可能仅表示 ambient 认证，并不一定含可转移 key。实际环境和存储文件不在本调查读取范围。

源码契约依据：
- `dsh-llm/lib/typert.remote-client.d.ts:10–18`；`dsh-client-ui-model-selection/lib/client.js:752`。
- `dsh-api-settings-controller/lib/typert.remote-client.d.ts:13–33`；`dsh-settings/lib/types/index.d.ts:92–114`；revision 检查在 ConfigEditor 锁内重新核对。
- `dsh-api-settings-controller/lib/types/credentials.d.ts:16–49`；`dsh-credentials/lib/types/index.d.ts:120–186`。
- `dsh-credentials-local/lib/types/index.d.ts:1–24`；官方写入使用文件 0600、目录 0700，但不加密。
- `dsh-llm-pi-ai/lib/types/auth.d.ts:13–25` 暴露 `recordKeyFor(providerId)`，scope 是 `llm-pi-ai/<route>`；这只是兼容插件的一个受限路径。

## 3. 预览：只有元数据，零写入、零密钥值读取

点击“同步到主 DSH”后先展示来源/目标，用户选择条目；这时不解析 secret。四类预览：

1. **将新增**：目标不存在的完整 provider profile（可含显式 models），目标对应插件和 schema 已有且兼容，配置只含白名单安全字段，并具有可安全处理的认证路径。
2. **已存在，跳过**：相同 provider/model 身份或目标已有密钥；不承诺两边 key 相同，不比较 key 值，不覆盖已有项。完全相同 profile 全部为无需同步。
3. **冲突，跳过**：同 route 但所有者/协议/endpoint/模型元数据不同、引用碰撞等；目标保持原样。不自动改名、合并覆盖或沿用冲突 key。
4. **不支持/需处理**：插件缺失、schema 不兼容、无法进行条件新增的 secret reference、OAuth/grant/环境依赖/文件认证、自定义秘密 header 或含凭据 URL 等。不给出一个看似安全但实际会覆盖的“继续”按钮。

预览字段：provider 身份/安全显示名、显式模型 ID、安全 HTTPS endpoint、冲突原因、计划新增范围；含 userinfo/query/hash/template 的 endpoint 整项拒绝，不是剥掉秘密后悄悄改变路由；认证仅用固定遮罩“已配置 / 将转移 / 需重新配置”。不显示 key、后几位、散列、原始 header、环境值或不受信错误正文。schema 的 secret redaction 并不能识别普通自定义 header/URL 中的秘密，不能直接展示或复制整份 redacted settings。

不自动安装/启用插件、不改变默认模型/专用选择、不删项。不把 adapter 隐式目录物化成显式 models 列表（显式列表可能替换整个原生目录）。已有 provider 下新增显式模型，只有在 schema 支持真正的最小新增且旧条目不变时才列为可新增；否则冲突/不支持。

## 4. 确认、并发和“永不覆盖”

- 用户勾选“将新增”条目，确认区域再次写清来源/目标和包含 API key 的事实，并要求独立勾选同意后点击确认。取消或预览失败：零写入。
- 来源/目标 host 持有短期、一次性、绑定用户/运行实例 generation、schema、命名空间 revision 和操作清单的 opaque 预览凭证；浏览器不持有 secret payload。
- 确认时重新核对双方状态；重启、schema/revision/身份变更或新冲突使预览过期，要求重新预览确认，不能自动无栅栏重试。
- 配置使用目标 revision 检查的最小路径新增，revision 必须传入。不能盲写 `providers.<existing>`，也不用全表 replace。
- 兼容 API-key **record** 可由 host `modifyRecord` 在锁内发现已有项就返回 undefined，保留现有值。不同引用的 `describe` 后 `set` 不是原子操作；可能覆盖或遮蔽已有 ambient key，**不能宣称符合永不覆盖**。
- 现有 API 没有配置与密钥跨存储原子事务。失败要明确报告成功/跳过/未完成，不破坏性回滚，不盲目 unset key 或删掉用户并发创建的配置。重试重新预览；用户已批准明确报告下的部分新增，不得声称全部成功。

## 5. API key 如何移动（仅在确认后）

获准后，受信来源 host 只读取已批准条目的 API-key record；通过独立、认证、目标绑定、有容量与超时边界的临时 host-to-host 通道，直接交给目标的**官方 credential provider**。浏览器/代理工具参数/会话输出/审计只含身份和结果，不含值；不经 argv、环境变量、临时明文导出、日志、请求体跟踪或真实密钥测试夹具，不返回 secret-read RPC 给浏览器。仅在内存保留最短生命周期；JS 字符串不能保证零化，不作虚假保证。

不复制 DSH Web 连接认证或订阅 OAuth/token/grant；订阅在隔离 runtime 单独登录。macOS Claude 首次登录自动导入系统 keychain 的风险仍由隔离方案单独评估，此功能不绕过它。

## 6. 用户已批准的决定（2026-11-04）

1. 使用 DSH 官方 credential-local 存储，接受其明文 YAML + 0600 模式；禁止额外临时文件、日志、聊天、测试夹具/导出中的 key 副本。开发和测试绝不读取/复制真实 key 或配置，只用内存生成的 SDK 夹具及 disposable DSH_HOME。
2. 批准独立 source-profile → target-profile 通道，仅手动按钮+明确预览确认后传输模型配置/API-key record；原会话管理窄桥无任何新增权限。
3. v1 仅兼容 API-key provider records，加带 revision 的配置最小新增；不支持 OAuth/token/login/reference/ambient 认证复制。写前复核实例、版本、revision，改变则重新预览，跳过冲突。用户理解没有通用 create-only host API 时无法承诺任意凭据路径严格永不覆盖；v1 record 分支仍使用官方锁内拒绝已有项，配置不覆盖已有项。
4. 允许部分成功，逐项准确报告成功/跳过/失败；失败项必须重新预览并确认后重试，不作虚假的全部成功结论，不破坏性清理。
5. 已批准两端页面的一次性配对：目标创建短期邀请，来源连接，目标批准来源，来源再确认目标；邀请不是 DSH Web/OAuth 令牌，不自动扫描其他 profile。每次同步仍需要预览确认。
6. 来源密钥使用执行确认时的当前 API-key record，不假称 DSH 提供凭据 revision/CAS；预览绝不读取值。
7. 用户接受先新增配置再条件导入 record 的短暂 ambient-auth 窗口、跨存储非事务及可能的部分新增。不能为掩盖失败而删配置或凭据。

## 7. 交付与运行边界

刷新在独立分支 feature/model-list-refresh（a9f10a1）完成；同步使用 feature/model-provider-sync，基于 dfdb5a64。先完成本地实现、夹具验证、独立审查和提交，报告两个 SHA 后才安排一起安装；不提前安装或重启、不 push。首次真实同步必须先交协调者并由用户批准。

## 8. 实现边界与手动流程

- 两端都安装本插件，在目标 Fishball 设置选择“创建目标邀请”；仅所有者页面看到短期 capability。在来源粘贴后点击连接；目标“检查配对状态”并批准来源；来源确认目标后预览。没有后台扫描、自动同步或定时重试。
- 独立通道仅监听随机端口的字面 127.0.0.1，256-bit 一次性 invitation/pair capability，5 分钟 TTL、10 秒操作/连接 deadline、1 MiB JSON 上限，拒绝 DNS 别名、重定向、浏览器 Origin/sec-fetch、重放与并发调用。仅允许 inventory/import 两类动作。
- 所有者路由依赖现有 DSH connection gateway 身份认证并额外拒绝跨 Origin 请求；不注册 agent tool、不扩展会话管理桥。配对/导入正文不接入调试录制或日志。
- 正式 ConfigEditor entry/fiber 的唯一活动所有者必须是官方 pi-ai 插件；匹配 schema 与 namespace generation，不能仅凭同名 schema 或目录 presence 判定可写。源/目标配置 inventory 只输出白名单 profile 与 credential metadata；不支持的已配置项仍列出，不泄漏原值。
- 仅新增完整 provider profile；已有 provider 下的模型不自动合并。配置由 expectedRevision 的官方 settings.mutate 最小路径 set 新增；目标 API-key record 由官方 modifyRecord 锁内 create-only。官方 pi-ai Config 生成的默认值允许规范化省略，非默认未知行为（headers、compat、自定义 reasoning 等）拒绝整项。
- 每次确认绑定两端 identity、版本、schema、namespace revision、owner generation、条目；先复核来源再读取所选当前 record。目标在配置和 record 写前复核，并在 credential lock 内重查批准 profile/revision。DSH 不提供配置与凭据的跨存储锁，因此不宣称绝对 CAS/原子事务。
- 结果逐项区分 config added/unchanged/failed/unknown、key imported/exists/failed/not-attempted/unknown 以及 succeeded/partial/failed/skipped/unknown。已确认提交的状态不因后续目录失败变成“未写入”；超时和可能已提交的 SDK 异常标为 unknown，不自动重试。仅目录 presence 用于 catalogAdvertised，不做账户认证网络探测。
- 同一运行期已知由本功能新增但缺 record 的 provider 可在 fresh preview 中列为 retry-key；只在原 profile/owner 未变且目标仍缺 record 时允许。通道关闭或 TTL 结束后不会持久化这种补写权限；普通已有 provider 永远跳过。
- 关闭/超时/卸载撤销 capability、取消 pending IO 和未来写入；已经开始的 SDK 写无法撤销。初始化采用 generation 隔离，关闭期间尚未完成的 factory 不能重新启动 listener。未显式 invite/begin 时不启动 listener、不做配置/credential inventory。

验证详情见 [validation](<model-provider-sync-validation.md>)。
