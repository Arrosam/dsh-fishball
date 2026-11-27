# 顾问随集合交付，按成员管理

**决定：** `fishball-consultant` 放在本仓库的 `packages/fishball-consultant/`，与 board、heartbeat、taskboard 平级。它有自己的 npm 包、DSH 行、配置及清理责任；同时是 `fishball-amenities` 的成员。不另建仓库，不把咨询实现写入集合入口、core、看板或 dsh-instance。**独立包不等于在集合安装后能单独删掉其文件。** 按现行方式可以只停用顾问行；只有没有集合持有它的单装模式，才能直接卸载顾问包。若要在保留集合时也物理卸载，须另改安装协议（见第 4 节）。

## 1．包、行与发行物分别由谁持有

本页为源码核对与设计，不是安装测试报告。基线：Fishball `bdcccc660a53`；dsh-fishball-instance `22912fbfccda`（下称实例仓库）；dsh-connector `5833930b9f52`。Fishball 各包和 dsh-instance 当前均为 `1.0.0-alpha.1`，目标端的 npm 包名是 [dsh-agent-connector@1.0.0-alpha.2](https://github.com/Arrosam/dsh-connector/blob/5833930b9f52/packages/dsh-connector/package.json#L2-L6)，不拿它的版本充当 Fishball 版本。Fishball 声明 Node `>=22.14`、DSH `>=0.2.1-rc.5`；[发行矩阵](../../scripts/release/constants.mjs#L46-L60) 锁定 DSH `0.2.1-rc.5` 与 `0.2.2-rc.1`。本机核对启动器用的是 `0.2.2-rc.3`，不代替上述两版验收。

| 位置 | 已有事实 | 顾问应作的变更 |
|---|---|---|
| [根工作区清单](../../package.json#L2-L18) | 根包是私有工作区，不是插件；现有六个目录是 core、三个成员、集合、shared。UI 随 core；shared 是库而非 bundle。 | 将新成员目录加入显式工作区。照[成员清单](../../packages/fishball-taskboard/package.json)声明包名、同批精确版本、仓库子目录、导出入口及 `./package.json`、`dsh.bundle.patch`；实际用到的 DSH 服务包作 peer，`fishball-shared` 用同版本依赖并随包携带。浏览器入口、图标、资源、服务端模块及自己的补丁均入 `files`；自己注册设置页，单装不依赖集合客户端。 |
| [集合清单](../../packages/fishball-amenities/package.json#L30-L55)、[集合补丁](../../packages/fishball-amenities/cordis.patch.yml)、[成员补丁示例](../../packages/fishball-taskboard/cordis.patch.yml) | 集合既在 `dependencies` 精确固定三个成员及 shared，又将它们列入 `bundleDependencies`；[集合服务端入口](../../packages/fishball-amenities/index.js)不加载成员。集合补丁按包名插入各行；单装才用成员自己的补丁。 | 在两个依赖字段加入顾问；在集合补丁及成员自有补丁中插入相同的 `id: fishball-consultant`、`name: fishball-consultant`、`config: {}`。用契约检查两处一致。集合与单装两条路径只能有一个生效的插入来源；遇已有单装包要迁移归属或拒绝重复启用，不叠两层同名行。集合说明列出顾问；[现有设置页](../../packages/fishball-amenities/client.js#L9-L25)为 heartbeat 映射行，顾问的同一个页面组件须接入 `plugins.row.config`：集合归属使用 `fishball-amenities#fishball-consultant`，单装使用 `fishball-consultant#fishball-consultant`。两种安装分别验证可打开页面，只读写顾问行的命名空间。 |
| [发行目录表](../../scripts/release/constants.mjs#L11-L54)、[打包器](../../scripts/pack-v3.mjs#L44-L67)、[暂存实现](../../scripts/release/stage.mjs#L37-L55) | `VERSION` 单一、标签 `alpha`；内部依赖不是区间。打包器核对版本后按 npm dry-run 清单复制到暂存区，将每个列出的内部包直接暂存到集合的 `node_modules/<包名>`，并非递归打包整个工作区；因此 shared 也单列在集合中。[制品生成](../../scripts/pack-v3.mjs#L134-L159)另为每个包生成 tgz、摘要与安装文档。 | 在 `PACKAGES` 中先成员后集合，给 `INSTALL_SETS` 加单装项；更新独立与集合安装说明、发布顺序及制品检查。在下一次正式交付统一选新版本，不能覆盖已发同版本；同时提供匹配版本的实例离线载体。仅增加工作区目录不会进入发行。 |

## 2．dsh-instance 实际找什么

子 profile 位于 `<主 DSH home>/fishball/runtime/dsh-home/profiles/fishball`，见 [pathsFor](https://github.com/Arrosam/dsh-fishball-instance/blob/22912fbfccda/packages/dsh-instance/src/native-runtime/files.js#L101-L105)。不是扫描所有 `packages/fishball-*`，也不是递归发现依赖的补丁：[实例放置常量](https://github.com/Arrosam/dsh-fishball-instance/blob/22912fbfccda/packages/dsh-instance/src/native-runtime/constants.js#L184-L195) 和 [实例发行清单](https://github.com/Arrosam/dsh-fishball-instance/blob/22912fbfccda/scripts/release/constants.mjs#L5-L15) 仅列 **fishball-amenities → fishball-core**；core 最后。文件里提到旧 board/ui 队列的注释不是执行清单。

- **源码运行。** [memberSource](https://github.com/Arrosam/dsh-fishball-instance/blob/22912fbfccda/packages/dsh-instance/src/native-runtime/placement.js#L153-L176) 对上述两项依次查 `FISHBALL_REPO/packages/<目录>`、实例真实路径旁的工作区、相邻 dsh-fishball 仓库；清单名字须匹配。[bundledLibraries](https://github.com/Arrosam/dsh-fishball-instance/blob/22912fbfccda/packages/dsh-instance/src/native-runtime/placement.js#L265-L302) 仅读这两项各自的 `bundleDependencies`，过滤为依赖值严格等于所有者版本；先按模块解析，再查同级同名目录，核验解析出的版本。同名库去重，不递归遍历新成员的依赖。因此顾问可被集合顺带复制，**不是新的顶层放置项**；若只写依赖区间，会被这个过滤器略过。
- **复制范围。** [shippedFiles](https://github.com/Arrosam/dsh-fishball-instance/blob/22912fbfccda/packages/dsh-instance/src/native-runtime/placement.js#L29-L79) 取清单及 `files` 所列文件；目录递归，只有最后一个路径段支持 `*`，`!路径` 按文件或目录前缀排除；显式列出却缺失的文件报错，匹配不到文件的末段通配不等于完整性验证。文件或遍历到的符号链接被拒，不应依赖 npm 隐式收录或仓库软链。[placeBundles](https://github.com/Arrosam/dsh-fishball-instance/blob/22912fbfccda/packages/dsh-instance/src/native-runtime/placement.js#L369-L389) 每次启动替换子 profile 中 `vendor/<名>` 与 `node_modules/<名>`，并登记 `file:./vendor/<名>` 依赖。扫描相对 import 的 `moduleClosure` 属于实例生命周期快照，不会替插件补齐漏列的模块。
- **发行包运行。** 实例包有 `bundled/` 即走[安装路径](https://github.com/Arrosam/dsh-fishball-instance/blob/22912fbfccda/packages/dsh-instance/src/native-runtime/placement.js#L178-L251)：先查两项是否皆为实例自身精确版本；否则以 DSH 包管理器尝试在线 add 这两包，失败且未取消则把对应内置 tgz 复制到子 profile 的 vendor 后离线 add；不自动激活新 bundle。[copiedSources](https://github.com/Arrosam/dsh-fishball-instance/blob/22912fbfccda/packages/dsh-instance/src/native-runtime/placement.js#L334-L347) 在此路径不再展开复制成员。顾问由集合制品携带，不会单独从注册表查找、安装或校验其版本；两顶层版本未变时不会因内部文件更新自动重装。
- **选择与加载。** `fishball-placement.json` 记录首次放置完成的顶层名字。已记录或启动前已声明的名字保留用户的开关，非集合项保持相对顺序；它不是「此成员已被卸载」记录。实例先放置再 [loadProfileDirectory](https://github.com/Arrosam/dsh-fishball-instance/blob/22912fbfccda/packages/dsh-instance/src/native-runtime/installation.js#L136-L162)，跳过任何已启用但不兼容的 bundle 均拒绝启动。核对 DSH 启动器（DSH 0.2.2-rc.3 的 `@deepseek-ai/dsh-app-boot/lib/index.js:1800–1828`）：只遍历 `dsh.profile.bundles`，按序读取对应包的补丁；之后合成 profile/home 覆盖。依赖存在、bundle 启用、行启用是三件不同的事。按常规集成无需为顾问修改顶层放置清单。

## 3．用户选择作用在哪一层

| 用户动作 | 生效范围 | 不能宣称的结果 |
|---|---|---|
| 在顾问设置中「暂停新咨询」 | 顾问行仍启用；拒绝新开与追问，设置页仍可查看状态、发起不收费的清理。 | 不是 DSH 行停用，也不是已取消在途远端工作。 |
| DSH 中只停用顾问行 | 在子 profile 以行 ID 覆盖 `disabled`；只撤销顾问的工具、提示、设置贡献与监听。此时顾问自身的设置页不再可用；待清理事项由目标端独立处理，或在重新启用后先进入只核对/清理的状态，不自动重放任何付费请求。只恢复一次绑定。DSH 的行覆盖（DSH 0.2.2-rc.3 的 `@deepseek-ai/dsh-plugin-manager/src/patch.ts:16–75`）不改 npm 依赖。 | 不是卸载；包、集合补丁及其余行仍在。子 bundle 的开关不能替代行开关。配置未完成或远端不具备能力是「不可咨询」，不是行没装。 |
| 单装顾问（无集合持有同一行） | 启停 bundle 只改 profile 的 bundle 选择；卸载由包管理器移除顾问的直接依赖、再去掉其 bundle 选择，不删除使用 shared 的其他插件。实例管理的普通子插件见 [setEnabled / uninstall](https://github.com/Arrosam/dsh-fishball-instance/blob/22912fbfccda/packages/dsh-instance/src/host/child-plugins.js#L329-L363)：拒绝受保护项；需删包时先 pnpm，失败不先删选择；子实例开着则重启，关闭则下次启动生效。 | 不承诺抹除 pnpm 缓存、业务历史或远端会话。已发请求须先停发并按[咨询契约](consultation-contract.md)核对处置；远端未确认不能报告已清理。 |
| 在集合模式尝试卸载顾问 | 发行模式本就可能没有顾问直接依赖；源码模式虽然写了直接的 `file:` 项，却会在下次启动刷新。即使只移除了顾问的直接声明，集合仍依赖它、补丁仍插行。现行界面应显示「由集合提供，可单独停用」，拒绝假卸载。 | 不能手删集合内文件、停掉整个集合，或调用实例卸载程序当作只删顾问。[子插件列表](https://github.com/Arrosam/dsh-fishball-instance/blob/22912fbfccda/packages/dsh-instance/src/host/child-plugins.js#L251-L268)过滤了[实例自有清单](https://github.com/Arrosam/dsh-fishball-instance/blob/22912fbfccda/packages/dsh-instance/src/native-runtime/constants.js#L313-L318)；把顾问添到该清单反而使常规启停和卸载被拒绝。 |

## 4．如果要求保留集合、单独物理卸载

这是与其他成员现行交付方式不同的增强，不能只改文案或多加一个勾选框。**若“卸载”是发布承诺，就先实施并验收下列变化；否则只承诺第 3 节的行停用与无集合时的包卸载。** “物理移除”指运行中的 profile 没有该成员的可加载文件、包引用或行，不指删除发布源、离线安装介质或全局缓存。

1. **改变运行时所有权。** 集合仍是成员目录及一键安装入口；为可移除成员维护带精确版本的安装目录清单，将其 tgz 作为独立离线制品，而非已安装集合的强依赖/内嵌代码。增强模式的集合补丁不能再无条件插顾问行；安装集合时由安装器将顾问作为 profile 直接 bundle 安装，由顾问自有补丁唯一持有行。普通 DSH 的集合安装与实例内安装都要有显式安装步骤；不能指望 `plugin add fishball-amenities` 自动执行目录清单，也不让插件启动时自行运行 pnpm。其余三个成员原有依赖、补丁及顺序无需改变。
2. **记住用户意图，不以缺文件当首次安装。** 子 profile 分别持久化未处理、已安装（启/停）、明确移除；实例的源码复制与发行安装均遵守。明确移除后跳过复制、联网、离线修复和升级补装，只允许用户主动重装；不把成员纳入 `CHILD_OWN_BUNDLES`。由子插件管理器在同一操作锁下处理依赖、bundle、用户选择及顾问专属 vendor 残留；失败或崩溃可恢复，不能在尚可加载时显示「已移除」。不动 shared、其他成员的行、作用域、用户配置、数据或主 profile。
3. **迁移和显示。** 升级识别旧集合嵌入、源码副本、既有单装、行禁用及混装；先记录原选择，再原子转换为一个归属，不因迁移触发咨询。管理界面按真实归属显示「停用此行」「卸载此包」或「由集合提供、不能单独卸载」。在途咨询先阻止新派发；对远端关闭/撤权留可核对的结果，未决清理有脱离顾问代码仍可执行的所有者或暂缓卸载。不要借清理历史删除其他成员的数据。

## 5．包安装成功不授予远端能力

顾问是 Fishball DSH 内的消费者。[本地契约](../../packages/core/contracts/index.d.ts#L44-L65)为 core 应用行提供的 `fishballInstance.apiVersion === 2`；用 [followInstance](../../packages/shared/instance-follower.js#L9-L42) 跟随服务，行作用域负责释放，缺 core、版本不符、core 替换/卸载均不阻断其他插件。不要导入 core 私有实现、实例宿主或 connector 服务。跨 DSH 的现有[目标契约](../../packages/core/contracts/targets.d.ts#L213-L237)与[桥实现](../../packages/core/src/bridge/index.js#L5-L25)绑定目标和端点世代；连接或操作不可用不能换目标补发。现有桥会把列出的工具投影给模型，不是新私有顾问能力的安全通道。目标端 [MCP 契约](https://github.com/Arrosam/dsh-connector/blob/5833930b9f52/packages/dsh-connector/mcp-schema/tools.js#L46-L70)的普通会话启动不保证只收授权简报、无工具、可关联回执。按[宿主契约](host-contract.md)与[连接器审计](connector-audit.md)新增并验证私有远端能力以前，安装、启用乃至看到普通远端会话工具均不得创建顾问会话或发送简报。

## 6．可观察的验收条件（实施时验证）

- **制品：** 单装 tgz 与完整集合 tgz 中的顾问入口、客户端、补丁、图标及其导入均可从干净 profile 解析；缺显式文件、共享包版本不符或源码含不安全链接时不产生可用的半安装。核对摘要、在线与断网安装；分别在两个发行支持版 DSH 上跑，不借工作区链接掩盖漏包。
- **放置与归属：** 对源码 checkout、发行包在线、发行包离线三路分别记录 profile 依赖、bundle 顺序、合成行及实际解析位置。常规集合模式只由集合插入一个顾问行，core 仍最后；无集合的单装只有顾问自己的行。混装/升级不双挂；关闭集合不应伪装成只关闭顾问。
- **独立性：** 在 board、heartbeat、taskboard 各有现存状态时仅停用顾问并重启、再启用；只少再多一个顾问绑定，无重复工具或迟到回调。其余行、配置、任务/备忘和 shared 可用性不变。无 core、旧 core、断链或无私有远端能力均不触发咨询，不使其余插件启动失败。
- **卸载判定：** 单装卸载成功后，profile 不再声明、加载顾问；故障注入时不报成功。常规集合模式只报停用，不用直接依赖消失冒充物理移除。若实现增强，分别从源码和发行安装卸载，验证没有直接或传递运行时副本、绑定、顾问行或遗留 vendor 包；重启、升级、断网修复后仍不回来。随后显式重装只恢复一次，兄弟成员前后状态相同。把远端清理未知、本地保留数据与物理包状态分开报告。
