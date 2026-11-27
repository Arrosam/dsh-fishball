# 自动更新任务板：宿主契约与交付依赖

**结论：不能直接用 staging 的每条 `turn-finished` 驱动自动写板。** 它证明受管根会话已停稳，不证明任务已完成，也不证明附带的最后一段文字来自刚结束的回合。所选弱模型只提议；同回合证据由连接器提供，写入、复核和通知由任务板宿主裁决。缺关键能力时保留手动任务板，不做付费推理、不写任务、不添通知。

核验范围：Fishball `staging@bdcccc66`（包含 `761e565c`）、独立仓库 `dsh-connector staging@5833930b`、本机 DSH `0.2.2-rc.3` 安装源码。以下「已核实」是这些版本的源码行为，不是线上实测；「提议」中的新接口均未实现。跨仓引用按本次本地检出的相对位置链接；其他检出布局请按上列版本及链接中的仓内路径定位（旧案版本见下）。

## 已核实：今天收到的是什么

| 环节 | 源码与可依赖的事实 | 不能据此判断什么 |
|---|---|---|
| 完成事件的生产 | Connector [createSessionSource / onTurnEnd / settle][c-source] 等待根会话回合结束、整棵树无运行中的 agent、无待处理输入及活跃子代理。后台 job 不阻挡报告；manager 自己 stop/redirect 导致的停稳被抑制；重启会丢失未报告的内存状态。 | 不是一个任务完成事件，不保证每次 turn/end 都有一条持久回执，更不表示后台工作成功。 |
| 路由与身份 | [routing 的 onTurnFinished 订阅][c-routing] 只路由受管会话，`sourceSessionId` 与 `payload.sessionId` 指向根，`correlationId:null`。Fishball [InterceptedEvent][events] 的可信身份是本地 `source.targetId`、`source.endpointEpoch`；同一事件可重送，不同目标可重用 eventId。 | 不可用目标显示名、单独的 sessionId/eventId 或消息内自称的身份关联、去重。没有任务 id、任务分配关系或专用用途证明。 |
| 文本范围 | [factsOf / finalTextOf / boundedFinalMessage][c-source] 配合 [TURN_END_REASON.completedKinds][c-reason]、[事件形状][c-shape] 和 [TURN_FINISHED][c-limit]：`completed` 也包括 `max-tokens`；`finalMessage?:{text,truncated}`，UTF-8 上限 4096 字节（含截断标记）；停止时给 `stop.kind/message`。 | `truncated:false` 只说明连接器未裁剪。`finalTextOf` 逆扫整份根会话历史，跳过空消息；本轮没有文字时可能复用上轮答复。新 eventId、session_read 的“最近一条”或两段文本相等/不等都不是本轮证明。 |
| Fishball 的分发 | [FishballInstanceEvents.intercept][events] 与 [createEvents][event-host] 是竞争性拦截：最高优先级的一名注册者处理；无匹配或处理失败才回到 Fishball。普通投递仍由 [createDelivery][delivery] 按既有策略静默附带或合批唤醒。 | 不存在“每个订阅者都旁听一次”的这一公共契约。占用拦截权、在 filter 中偷偷触发副作用、另开邮箱拉取/确认都会干扰现有流程。 |

## 已核实：Fishball 能复用什么

- **选模型要分清在哪台 DSH 调用。** [ModelControl / modelChoices][picker] 在 Fishball 的 DSH 上读 `remote.session.modelCatalog()`；值保留 `{provider,model}`，显示名不是键。现有控件写 **manager** 的设置，清空代表使用 DSH 默认，不能照搬此语义。Connector [models_list / session_start][c-tools] 列的是**目标** DSH 可用于启动受管会话的模型，`model`、`reasoningEffort` 是 start 的可选参数；[startManaged][c-start] 走创建、管理、发首条消息，并非单次推理，也不会自动变成无工具会话。
- **一次推理有宿主先例。** DSH 安装目录的 `node_modules/@deepseek-ai/dsh-session-title-llm/lib/index.js:160–220`（`executeSessionTitleLlm`） 使用 `ctx.llm.prepareCall`、`call.stream`、截止信号、输入/输出上限和终止原因处理；这是调用形态的证据，不是任务板已有的服务，亦不复用其 title 用途、路由默认值或记全文日志的做法。
- **PTC 是 manager 的工具传输，不是触发器。** [installManagerPtc][ptc] 默认启用，具备 scoped executor 和 ptcRuntime 时只在 manager 上挂 PTC，禁止程序请求更宽沙箱；禁用或无 runtime 时有 scoped executor 才装 native，否则不安装。任务板 [apply][board-main] 经 `manager.registerSetup` 注册真实工具；[createTools][board-tools] 再核对执行者的 session id。PTC 开时 manager 在 `run_code` 内调用已注册工具（例如 `await tools.taskboard_read({})`）；native 时同一逻辑工具直接调用。没有理由给弱模型 `run_code` 或任何工具。
- **问人不阻塞当前回合。** Fishball [createQuestionCards.toolFor / answer / deliver][questions] 的本地 `ask_user` 校验、持久化卡片并立即返回 `{cardId}`；人作答后才将答案以稳定 messageId 送回所属 manager。连接器 [question_answer][c-tools] 是回答目标会话已存在的 offer，并非这里的提问。复核时 Fishball 可按需开卡，不能把返回 cardId 当回答、批准、自动完成或弱模型的同步依赖。
- **板的提交与通知是两步。** [openStore.change][store] 串行处理同一板的 UI 和工具变更；[saveBoard][board] 有整板 baseRevision 检查，现有 `taskboard_update` 没有该参数且能改标题、整段替换 note。[registerRoutes / wakeFishball][routes] 在 UI 有变化且提交成功后才 `manager.notify`，失败报告 `notified:false`，不回滚。此路径生成 **用户编辑** 文案和随机键，不可模拟为自动更新。可复用的是 [manager.notify][notice] 的 `pluginId,dedupeKey,text,wake` 接口；其去重有保留上限，不能取代任务板自己的批次回执。

## 提议：从事件到一次有据可查的变更

1. **先检验证据，不抢原事件。** Connector 需以可发现的版本能力提供「本根回合」的结束原因、文本边界/消息出处，以及可信普通受管工作会话身份。按该回合边界取文本，本轮没有就不得继承。Fishball core 需在受信入口旁提供只读、可注销的普通工作回合观察口：传目标、epoch、事件和上述事实，不授予 ack、拦截或改写权；原有拦截、合批、静默和失败路径不等待推理。回调可能重复或缺失，不承诺完整重放。实际调用前和提交前核对仍受管、epoch 有效、用途仍匹配。缺证明、空白、截断、非正常结束（含 max-tokens）、接管权变更或来源不明均跳过。不用原始 DSH 全局 turn/end 代替跨目标入口。
2. **再决定是否花费。** 设置仅保存**本功能**显式选定的本地 provider/model；未选即关闭，关闭清空选择并取消未提交操作。模型消失/目录不可用显示原因，不切换 manager、默认、顾问或远程模型。先检查本功能事件回执、预算/频率和板快照：无候选或全板任务数（含已关闭）超过 20 即跳过；20 是提案的推理上限，不改变存储容量。送入模型的是有界的本轮输出及现有任务树投影，不是历史对话、memo、凭据或工具；所有文本含任务名、note 都按数据处理。发起前持久登记本事件的调用占位；并发重送、重启后结局未知，都不再发第二次请求。一次受限调用只收结构化建议，不执行模型输出，失败/超时/429 默认不重试。
3. **写入只由任务板完成。** 以 `(targetId,endpointEpoch,eventId)` 标识来源，已处理则不重算。宿主只接受证据唯一指向已有任务 id 的 status、progress 或 note 证据追加，不许新建、改父子关系、重写旧 note 或改 memo；没有匹配、重名歧义或无变化都不写任务。提交在同一个 `store.change` 队列内重检整板 baseRevision；冲突整批放弃，不拿旧建议覆盖用户新编辑。板、审计、复核记录及批次回执由任务板私有存储一次原子提交；撤销是带版本条件的新变更，不是逆写旧快照。
4. **分清“待复核”与“已更新”。** `done` / 100% 只持久化待复核项，不自主完成、不偷偷改成 99%。即使没有任务变更，用户仍可在板上看到；Fishball 下次读板呈现复核摘要。提议保持 `taskboard_read({})` 的参数不变，仅在有待审时于结果外层附加可选 `autoReviews`（含复核 ID 和版本）。仅 manager 可用提议的 `taskboard_resolve_review({reviewId,expectedReviewVersion,baseRevision,decision})`：重读验收证据，在同次事务内按版本确认或驳回；过期则拒绝，不能先无条件更新任务再清标。弱模型没有这项能力。
5. **只为真正提交的任务变化通知 Fishball。** 同批一个稳定且属于任务板的 dedupeKey，一条 manager 通知列出来源会话 id、改变的各任务及新进度、提交后直接父任务及其已存进度（深层给出根路径、顶层注明无父项）；不计算或改写父项。混合批次可附待复核提示；仅待复核、无变化、失败、冲突均无本功能唤醒。用户通过任务板行和审计查看；不另外发聊天副本或 push。通知失败留已提交事实和投递状态，不再付费推理、重写或盲重发。此静默约束只限本功能；不吞并、不抑制连接器原有的工作汇报。板审计、撤销、manager 的回合、复核或通知均不是自动化输入。

## 独立性与真正的宿主依赖

- **与顾问项目分开交付。** 自动更新属于 `fishball-taskboard`：本机一次无工具调用，无工作区、远端会话、话题生命周期或顾问回执。顾问若实现，可独立选择目标模型并管理其专用会话。本项目不读写对方文件、设置键、账本、工具名、通知键或私有事件；不引入共同的“辅助模型”开关、角色或必装包。缺少/卸载任一项目不影响另一项目。仅依靠普通工作会话的宿主分类排除其他用途，不通过对方的私有会话表反查。
- **单列宿主前置项，而非两个项目互改同一文件。** 本轮来源/用途证明属于 connector；只读交付及来源有效性属于 Fishball core。两者作为各宿主独立变更、独立审核和测试，业务项目只消费能力，不各自修改分发器、不共享业务事件。两个项目若都需要准确区分本轮结果，可依赖相同的宿主事实；顾问请求与回合的专属关联和回收仍是另一契约。既有模型目录、LLM 和 manager.notify 也是宿主设施，不是对方功能的依赖。旧宿主不满足时仅停用自动更新，**不能把当前 staging 写成可安全启用**。
- **旧案是对照，不是现状。** Fishball 历史评审 `eb74c115` 的 [触发流程][old-flow] 尚建议以 worker 输出提示 manager 检查，板没有 session→task 绑定；[评审结论][old-review] 与[顾问契约][old-consult] 则讨论独立的受限、按话题可续问的目标会话、精确回执和安全销毁。本需求允许弱模型提出非终态的有限字段变更，替换旧案的“仅提醒”，不承接其顾问工具或权限。旧案中仍成立的判断：同名不等于同任务，worker 自报完成不等于通过验收，旧回合不能替新回合举证。

**启用验收**：上一轮有文字、这一轮空回复 → 零推理、零写入；同一事件重送 → 无第二次调用或通知；不同目标同 eventId → 不串板更新来源；关闭或目标失效发生在模型返回前 → 结果作废；另一个拦截者已注册或本功能失败 → 既有路由、ack 与 wake 行为不变；仅完成建议 → 下次读板可复核、零额外唤醒；三个任务真有变化 → 一次提交、一条含各自父项进度的通知。

[c-source]: ../../../../../../../dsh-connector/packages/dsh-connector/src/wire/sessions.js#L24-L155
[c-routing]: ../../../../../../../dsh-connector/packages/dsh-connector/src/routing/index.js#L144-L149
[c-reason]: ../../../../../../../dsh-connector/packages/dsh-connector/src/wire/constants.js#L31-L39
[c-shape]: ../../../../../../../dsh-connector/packages/dsh-connector/mcp-schema/shapes.js#L153-L156
[c-limit]: ../../../../../../../dsh-connector/packages/dsh-connector/mcp-schema/constants.js#L694
[c-tools]: ../../../../../../../dsh-connector/packages/dsh-connector/mcp-schema/tools.js#L42-L80
[c-start]: ../../../../../../../dsh-connector/packages/dsh-connector/src/mcp/tools/start.js#L1-L38
[events]: ../../../packages/core/contracts/events.d.ts#L8-L45
[event-host]: ../../../packages/core/src/events/index.js#L36-L45
[delivery]: ../../../packages/core/src/events/delivery.js#L1-L34
[picker]: ../../../packages/core/client.settings.js#L733-L775
[ptc]: ../../../packages/core/src/manager/ptc.js#L12-L29
[questions]: ../../../packages/core/src/asks/questions.js#L70-L145
[board-main]: ../../../packages/fishball-taskboard/index.js#L25-L46
[board-tools]: ../../../packages/fishball-taskboard/src/tools.js#L47-L69
[store]: ../../../packages/fishball-taskboard/src/store.js#L24-L56
[board]: ../../../packages/fishball-taskboard/src/board.js#L246-L265
[routes]: ../../../packages/fishball-taskboard/src/routes.js#L27-L69
[notice]: ../../../packages/core/src/manager/service.js#L311-L350
[old-flow]: ../../../../review-fishball-trigger-consult-design/docs/proposals/fishball-trigger-flow.md#L32-L46
[old-review]: ../../../../review-fishball-trigger-consult-design/docs/proposals/fishball-trigger-consult-review.md#L13-L18
[old-consult]: ../../../../review-fishball-trigger-consult-design/docs/proposals/fishball-consultant.md
