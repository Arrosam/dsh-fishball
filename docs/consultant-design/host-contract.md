# 顾问插件与宿主的契约

**顾问属于本仓库的 Fishball amenities 集合：建议放在 `packages/fishball-consultant/`，与 board、heartbeat、taskboard 平级，作为可单装、单装时可卸载、集合内可单独停用的 DSH 插件（集合内物理卸载另见[安装协议](amenity-placement.md)），不另建仓库。** Fishball 决定是否咨询、核验建议、执行后续协调并回答用户；顾问是所选目标 DSH 上的独立会话，只对一个明确的任务或话题提供文字建议。它不是第二个执行者，也不是 taskboard 的子功能。现有接口足以挂载管理器工具、配置页与通知，**不足以安全地启动顾问推理**；目标端的私有准入、逐请求回执和隔离未就绪时应报告不可用，不降级为普通工作会话。

核对范围：Fishball `staging@bdcccc66`（含 `761e565c`、`1a67b63d`），对照设计审查工作树的 Part B 提案。本次另查独立 dsh-connector 的 `staging@5833930b`（提案基线为 `83e26c9`）与已安装 DSH `0.2.2-rc.3` 源码。下文“已有”指静态核对，“需要”指拟议协议，不是已发布 API 或运行验证。

## 1. 包如何挂载，谁持有状态

| 所有者 | 已有接口及其边界 | 顾问接入建议 |
|---|---|---|
| 可选插件与 core | [实例跟随器](../../packages/shared/instance-follower.js#L9-L42) 会跟随兼容的 `fishballInstance`（现为 v2），服务替换/消失时撤销旧绑定；[taskboard 的挂载示例](../../packages/fishball-taskboard/index.js#L20-L46) 和 [X2 实现](../../packages/core/src/manager/service.js#L249-L262) 展示了作用域及撤销方式。 | 包自带 DSH bundle/row、配置页与版本化 storage domain；不把 core 列为启动所需的强注入；单独安装不依赖 taskboard，集合安装也不能自动授权披露或启用付费咨询。只有绑定当前 manager 才用 `manager.registerSetup(pluginId, fn)` 在 `agentCtx.tools` 注册工具，在 `agentCtx.systemPrompt.section` 加条件指引。setup 只组装，不启动会话、不发送通知。卸载贡献一起撤销；恢复未完请求在发布后处理。无兼容 core 时显示原因，不影响其他插件。 |
| Fishball 管理器 | 普通贡献工具随 singleton manager 的作用域，不进入其他 agent。已有 [X10 通知](../../packages/core/src/manager/service.js#L295-L331) 支持 `pluginId/text/wake/dedupeKey`。 | 拟只给模型 `consultant_ask({subject,question,evidence?})` 和 `consultant_close({subject,reason})`。严格校验有界字段、拒绝多余参数；模型不能指定目标、模型、权限、原始 sessionId 或请求 ID。ask 可先返回 `awaiting-consent` 及 requestId（尚未发送）；实际准入后才是 `accepted`，可能已投递而无法确认时为 `unconfirmed`，均沿用原 requestId，其他情况明确拒绝；**受理不是建议**。close 与查清理状态不需模型配置或付费调用。 |
| 配置与任务来源 | [core 配置页](../../packages/core/client.settings.js#L8-L28) 是自己的 bundle 页；已撤销 `fishballSettingsSections`。看板的 [store.onChange](../../packages/fishball-taskboard/src/store.js#L24-L56) 只是包内提交后的快照，不是供顾问使用的宿主接口。 | 顾问拥有自己的 bundle 配置和仅所有者可操作的状态页。外部任务联动是可选适配：仅当可信任务来源提供稳定身份、状态及可从游标重放的终止修订时，才按其权威记录自动结束绑定；离线间完成又重开也必须可识别。缺来源或历史有缺口时仅暂停该外部任务的发送，不推断删除。显式独立话题和经授权的手动关闭始终不需要任务来源，不要求安装、修改或读写 taskboard。 |

插件按本 profile 中的 `{kind:task|topic,id}` 建唯一绑定；不能用标题、全文相似度或模型名作键。首次受理固定目标 ID、端点世代、工作区、模型路由、管理主体及远端咨询/会话 ID；每问另有宿主分配的 requestId。持久化未决、已交付与已关闭状态。**同题追问复用原会话；一轮结束不等于话题结束。** 不同题目不共享历史；配置改变不把旧历史交给新目标，也不在旧目标继续发。一个绑定只准一个在途问题；重启后先核对原绑定，未知结果不重发。独立话题身份如何显式建立和终止仍待产品确定。

**顾问专用标识（拟议，非现有宿主 API）：** 配置只写 `fishball-consultant` row 的 `targetId`、`endpointEpoch`、`workspaceId`、`model`、`reasoningEffort`、`asksPerSubject`、`asksPerDay`、`paused` 字段；持久域 `fishball_consultant` 的 `bindings`、`requests`、`outbox` 表分别记录主题、请求和通知交付。私有协议用 `fishball-consultant.receipt.v1` 标识已落盘的终态通知，验证来源后才以 `pluginId: fishball-consultant` 调用 X10；该名称不注册为公共 mailbox 事件，不是权限凭据。所有字段均不复用 core 或其他 amenity 的存储。

## 2. 两种模型选择不能互相代替

- **Fishball 自用模型（已有）**：首次配置可在 dsh-instance 引导中完成，也可在 [core 设置](../../packages/core/README.md#L75-L77) 修改。它读取本 Fishball DSH 的 `remote.session.modelCatalog()`；[ModelControl](../../packages/core/client.settings.js#L735-L795) 分开显示模型、推理力度，两者写同一配置对象。未配置时允许本机默认模型。提交 `1a67b63d` 已删掉提案所引的 Fishball 页面旧弹窗；不要复制该入口、复活 composer 选择器或改写 manager 配置。
- **顾问用模型（需要）**：在顾问自己的设置先选目标，再从该目标实时 `models_list.models[]` 选择，保存精确 `model`（provider/model）；如开放力度则在单独控件只列该项的 `reasoningEfforts`，无选项不显示。呈现方式可以共用，数据源、配置键、缺省行为不能共用。由包的服务端用 [目标绑定 bridge](../../packages/core/contracts/targets.d.ts#L213-L239) 只申请发现所需操作，前端只得到目录与状态；检查 targetId 和 endpointEpoch，弃掉切换目标后才返回的旧目录。
- 打开时刷新，发送时再次核验：未选、清空或选项消失给 `CONFIGURE_MODEL`；断链/不能确认目录给可操作的不可用提示；已有绑定换了有效路由则 `BINDING_CHANGED`。保留失效选择便于修复，绝不预选、自由输入、套用 `defaultModel`、继承 Fishball 或回退其他供应商。上述失败均无新建、无推理。目录与权限不同：[bridge 的 allowlist](../../packages/core/src/bridge/index.js#L345-L360) 只限定本地句柄可调用的已发现操作，不是服务端 ACL。

## 3. 两段异步交互：先问人，再问顾问

1. **澄清不是授权。** 如任务含义不清，Fishball 可用无目标前缀的本地 `ask_user` 询问。[bdcccc66 的问题卡](../../packages/core/src/asks/questions.js#L122-L145) 存卡即返回 `{cardId}`；答复日后作为带 cardId 与问题 ID 的普通用户消息回到原管理器（[投递与恢复](../../packages/core/src/asks/questions.js#L45-L108)）。不等待、不轮询、不把跳过当许可。即使卡上准确写了目的地、用户也点了“同意”，模型所写的普通卡、卡号和回覆文字仍**不是**外发授权。它也不是目标权限卡、`approval_answer`、阻塞的 `ask_user_question` 或顾问回执。
2. **一次性披露确认（需要新宿主接口）。** 首次调用 `consultant_ask` 时宿主分配 requestId、冻结校验过的简报与目标/世代、工作区、供应商及模型。可信渲染器从宿主记录生成只供所有者操作的披露卡，不采用模型拟的摘要或按钮文案。卡片可核对本次问题、证据原文，以及供应商本次将实际看到的完整重放：历次问题、证据和顾问回答，按实际顺序和角色呈现。即使管理器当时只收到截断建议，也须从可信记录展示将重发的实际内容，不能用截短回执替代。无法精确重建、验证或展示时拒绝，不先发送简报去试。

   ask 此时可立即返回 `awaiting-consent`，无远端新建、无推理。**只有经认证的所有者在这张专用卡上点“仅本次允许”**，宿主才把决定绑定到同一 requestId、接收方和冻结载荷；直接续办原请求，不让管理器再调用 ask，也不提供第三个批准工具。到供应商发送边界，还须将实际目的地及最终载荷（含任何历史重放、上下文拼装）与批准快照逐项比对，确认请求未撤销/未使用，原子消费一次性授权。内容或路由变化、上下文不可观察、重复点击或授权失效都不得新发。模拟对话中的 `accepted` 是该请求通过准入后的状态更新，不是另一次 ask，也不代表已收到建议。
3. 调用本地顾问工具，收到本次状态（包括 `awaiting-consent`）即可结束。DSH 0.2.2 默认在管理器使用 PTC：通过 `run_code` 内 `await tools.consultant_ask(…)` 取得即时状态，检查结果，不循环等 advice。卡片同理。PTC 不可用或配置关闭时沿原生模式直接调用同一工具；不注册第二套包装器、不改全局 preset、不申请 `sandbox_permissions`（[executor 安装与 guard](../../packages/core/src/manager/ptc.js#L12-L29)、[原生问题工具掩蔽](../../packages/core/src/manager/session.js#L161-L174)）。不能因超时或看到历史 direct-call 就自动再付费调用。
4. 私有回执持久化后才用 X10 通知原管理器。去重键包含包命名空间、绑定/世代、requestId 和终态；通知带明确来源、subject、requestId、结果类型、有限正文及截断标志。它是插件提供的**非可信建议**，不是用户授权。Fishball 验证后自行决定，只有 Fishball 经 `message_user` 向用户表述。不要伪造用户消息、卡片回复、工具事件或聊天气泡。提交 `761e565c` 的 [消息呈现](../../packages/core/ui/fishball-page/client.js#L620-L656) 识别 direct 与 PTC 子调用开始事件，只在关联的 `UNKNOWN_TOOL` 拒绝结果上隐藏错误气泡；普通错误或中断不等于未调用。UI 是否显示不是送达、授权或结果回执。

## 4. 目标宿主必须补的契约

| 必要保证 | 已核对的现状 | 需要的行为（缺失即不可用） |
|---|---|---|
| 发第一条信息前已有隔离 | connector 的 `mcp-schema/tools.js:42–70` 没有 preset、权限、主题或幂等参数。`src/mcp/tools/start.js:startManaged` 容忍接管及 afterManaged 失败；`src/domain/session-port.js:start` 可在工作区挂载失败后继续，首投失败也可返回 sessionId。 | 在发布或恢复会话前即关闭所有唤醒入口；私有、版本化的宿主通道完成协商、按请求建档、校验归属/放置/实际模型，然后只放行这一问。凭据仅在宿主端，与普通配对 bearer 分离并绑定主体、端点世代、操作及绑定；不在 MCP 工具列表、模型、浏览器中暴露。普通 session 消息、管理动作、外部 GUI 和其他插件不能向顾问送入未准许的一轮。不得先用普通 `session_start` 启动再补策略。 |
| 只推理，不执行 | DSH 的 `dsh-api-session-controller/src/agent.ts:261–273` 可在发布前 mount preset；没有 preset registry 时只安装模型选择。`dsh-tools/src/index.ts:155–201` 的 restrict 不挡 scope 自己注册的工具，也不能以保留的 PTC transport 名作掩码。 | 初版仅收简报，无任何顾问工具，包括读文件、PTC、shell、MCP、审批、子代理、任务、浏览器和网络工具；只准宿主对已选供应商发起推理。只读沙箱、禁止提权是附加层；不能以 prompt、空目录/空工具菜单或事后检查代替实际调用控制。隔离默认插件和工作区指令注入，逐轮及能力变化时复验；任一路径不能证明关闭就不送入问题。 |
| 逐请求完成，不靠猜测 | 普通 `turn-finished` 是 [manager persona 所述的工作会话消息](../../packages/core/src/persona.js#L94-L101)。connector 的 `src/wire/sessions.js:createSessionSource/finalTextOf/settle` 合并根树静止状态，管理者 stop 可不发，未发状态在内存，且回扫整个根会话最近非空回答。 | 入场时固定 requestId、输入边界、确切 turnId 与起止游标；只从这轮区间取最终文本。无文本为 `empty`，停止、失败各有终态，区间缺失为未确认，绝不用前一问的回答。目标先持久化结果/有限引用再推送；断线走同身份的私有 status 对账，不能用 `session_read` 最后一条、公共事件、再问一次来补。 |
| 与普通事件彻底分流 | [events 契约](../../packages/core/contracts/events.d.ts#L8-L31) 是竞争式分派：同类型最高优先级、同级先注册者获选；无命中或接收方失败回退 Fishball，不是私密订阅。[ledger](../../packages/core/src/events/interception.js#L5-L21) 的键是 targetId、endpointEpoch、eventId。 | 在目标**生成公共邮箱事件之前**按宿主绑定隔离顾问流量；不产生普通 worker 的完成、问题、权限、任务触发或第二次唤醒。不能只靠抢占 interceptor、事件标题/文字或高优先级。无关会话的事件按原策略继续。接收私有回执时核验主体、目标/世代、咨询/会话、请求/轮次及状态；重复只确认、不二次通知，关闭后的回执仅对账。插件停用或缺席时也不可回落到普通事件流；触发器、心跳或顾问通知不得直接递归触发付费咨询。 |
| 通知及清理可恢复 | X10 的 queued/held/duplicate 是收件状态，不是模型已读；[已排队但未唤醒的分支](../../packages/core/src/manager/service.js#L295-L313) 明报 `pending-wake-unsupported`。公共 stop 只终止活动，release 只交回管理，均非处置/清除。 | 插件以持久 outbox 和稳定 dedupeKey 交付，错误保留待核对，不因通知失败重跑咨询。关闭先持久标记并禁止新轮/旧回执，原有主体验证通过才停止、完成约定处置，再释放管理权。失联或所有者变了显示“清理待处理/需原所有者介入”，不可接管他人的会话。禁用留下不依赖推理的清理入口；整包卸载若钩子不保证执行，必须由目标持久记录及所有者可达的恢复路径接手，不承诺自动清理成功。归档可逆且不等于删除。 |

## 5. 数据边界与交付门槛

发送前逐问核验“我能读”以外的三件事：**用户允许披露什么、发往哪里、后续调用能否再次带上已有历史**。发送目标、限制、待比较选项和少量经授权摘录，不发送整段历史、其他任务、隐私推理、密钥、附件、原始日志或隐式工作区提示。输入和输出都设字节边界，超限输入明确拒绝，截短输出显式标记。咨询不授权执行建议。插件保存恢复所需最少的绑定、授权引用、回执和交付状态；正文仅为授权历史或未送达结果所需，日志不写正文、凭据。显示存在的远端历史；留存期限、归档/清除方式及工作区选择须获确认，不许暗设。

付费前先做原子预算预留；未确认投递不释放、不另起同题会话。不能取得总输入（含历史）及输出的可执行上界时，不宣称硬 token/金额上限；未知用量不能记零。设置页向所有者区分配置未齐、不可用、发送未确认和清理待办；预算单位、数值、保留期未定不应写成宿主默认值。

**发布验收（设计要求，未执行）：**

- 仅装 core 或仅装顾问且无兼容 core 时，既有会话、模型和事件行为不变；装顾问但不装看板可处理显式独立话题。重载插件后无重复工具或提示。
- 管理器 PTC 与原生模式各验证一次：普通澄清卡即使答“同意”也不外发；专用卡拒绝、跳过、过期、载荷变化或历史不可验证，外发次数均为零。管理器上轮回执截断而目标会重放完整建议时，必须展示并核对实际重放原文；同一专用卡重复点击只续办一次原请求。获准的首问与追问复用会话，拒绝的 direct `message_user` 不产生假成功。
- 普通会话与两个顾问请求并发，跨目标出现相同 eventId，第二轮空答、停机重启、关闭后迟到、禁用时私有回执：普通事件仍到原接收方，建议不串轮、不重复唤醒，不触发新咨询。
- 配置清空、端点替换、模型消失、工作区未确认、无私有协议或执行权限不能证明受限时，不放行推理；首投超时仅对账，清理不能验证所有者就不动远端。测试须观测真实发送/执行次数，不能只检查模型提示或页面。
