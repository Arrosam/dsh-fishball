# Connector 审计：普通受管会话不是只给建议的顾问

**判定：在所核版本上不能启用顾问。** Connector 能发现模型、创建普通 worker、选择模型、投递消息、读结果和停机，但没有途径证明「推理前已禁止所有工具」「只把授权简报送到指定 provider」或「本答复属于本次请求」。缺版本声明或任一证明，就不创建、不发简报、不退回普通 worker。以下是源码结论，不是已运行的隔离测试。

**复核基线。** C = 独立仓库 dsh-connector，已核实本地 staging 与干净 HEAD 同为 `5833930b9f52b7c0d308ddce6264fad6a3ed3485`，路径根为 packages/dsh-connector；H = 安装版 DSH 0.2.2-rc.3 下的 @deepseek-ai 包；F = Fishball 设计工作树 `bdcccc66`，路径根为 packages/core；P = 评审工作树 `eb74c115` 的 顾问提案 `dsh-fishball@eb74c115:docs/proposals/fishball-consultant.md:3–16,43–82`。提案第 7 行所列 connector 为 83e26c9，不是本审计依据。比较两个 connector 修订并重新读取本地实现；例如新的自动拒绝/转交属于已有权限请求的处理，不是新建会话的顾问模式。

## 1．首个模型请求之前，哪里真正设了门

| 顺序 | 实际存在的边界 | 不能据此承诺什么 |
|---|---|---|
| 发现、建会话 | `C/mcp-schema/tools.js:46–70` 的 DEFINITIONS：发现 workspace、模型及不可用 provider；start 必填 folder/title/message/attachments，可选 model/reasoningEffort，返回 sessionId/managed/running 及部分错误。`C/src/domain/folder.js:25–34` 的 placeOf 要求目录存在，返回 workspaceId 或 cwd。 | 无顾问 preset、权限、工具/上下文白名单、主题、请求幂等键、用量预算。有效 cwd 只证明目录存在，不证明允许把其内容发往目标。 |
| 创建前 | `C/src/domain/session-port.js:368–379` 的 start 先限长、验证显式模型，再消费附件、创建、命名、安装选择、管理。`C/src/session-model.js:12–30` 的 prepareSessionModel 按首个斜杠拆 provider/model；两项选择均省略时走旧路径。 | 可复用校验；不能把默认模型当成用户选定的顾问。限制消息字节也不限制系统提示、历史、推理及输出的计费用量。 |
| 发布与落位 | `H/dsh-api-session-controller/src/commands.ts:120–158` 的 create 支持 sessionId、agentPreset、workspaceId 或 cwd；先创建 agent，再 attach。`H/dsh-api-session-controller/src/agent.ts:261–273` 的 composeAgent 可在发布前挂载解析后的 preset；无 registry 时只装 model selection。`C/src/wire/domain.js:126–138` 未传 preset/指定会话 ID；`C/src/domain/session-port.js:333–353` 将 attach 失败转为带 sessionId 的 workspaceError，命名失败也可继续。 | **宿主有前置组合点，connector 没有用它建立顾问门。** 可能在非预期 Ungrouped 位置收首问；请求某个 preset 名也不是实际生效证据。 |
| 路由与管理 | `C/src/session-model.js:33–70` 的 applySessionModel 在已发布的 agent 上取得 maintenance，若已有 requestHeader、turn/start 或非预期 pending 选择则拒绝；写选择事件、安装临时选择器并 flush，首个 header 后卸下。`C/src/mcp/tools/start.js:25–44` 的 startManaged 捕获管理异常，管理返回 false 亦继续；afterManaged 抛错只记日志。`C/src/wire/domain.js:171–198` 的插件服务使用同一 schema、同一 startManaged。 | 显式路由失败可挡住**本次 connector 的 steer**；它既不能撤销之前其他入口的唤醒，也未永久锁定后续 GUI 换模型。Watchdog 式创建后回调不是拒绝首轮的机制。普通成功允许 managed=false。 |
| 首投递与追问 | `C/src/domain/session-port.js:285–299` 的投递以 flush 区分 delivered/unconfirmed；同文件 `C/src/domain/session-port.js:356–391` 的 message 直接 steer，start 只取 running，首投递抛错也仍返回已有 sessionId。 | running 是瞬时状态，不是收件、执行、完成或计费回执。追问没有主题串行/忙时拒绝，不等于另开一个可精确关联的 turn。 |

## 2．从简报到 provider，再到结果接收者

**零工具与仅简报是两项独立条件。** `H/dsh-agent-loop/src/agent.ts:298–318` 调用 tools.resolve、systemPrompt.assemble 和 agent/pre-step；`H/dsh-agent-loop/src/agent.ts:447–496` 刷新上下文、投影并追加消息、buildRequest，再交 preparedCall.stream 或 llm.stream。`H/dsh-agent-loop/src/agent.ts:662–745` 的 buildRequest 使用投影后的消息和 header；不是直接把 connector 的 message 原样交给模型。`H/dsh-agent-instructions/src/index.ts:182–201`、`H/dsh-agent-instructions/src/index.ts:330–348` 显示指令插件能追加基线与 pre-step 内容。故即使不提供读文件工具、只发文字、选中空目录，也不能证明实际请求没有工作区指令、环境、技能/插件说明、额外 inbox 或越权历史；应以 provider 收到的包为准。

**执行路径仍存在。** `H/dsh-agent-loop/src/agent.ts:586–599` 以解析出的 toolSet 调用 tools.execute。`H/dsh-tools/src/index.ts:155–201` 的 restrict/view 约束继承工具，但本 scope 注册项豁免，亦不允许以保留的 PTC 传输名作过滤项。`C/src/domain/session-tools.js:1–21`、`C/src/domain/session-tools.js:64–100` 明确将 message_agent 装进受管 agent 自己的 scope，可向管理者发消息，并在 agent 重建时重装。`H/dsh-permission-presets/src/index.ts:399–413` 的 sandbox/approval 设置与工具执行限制是不同层次；`C/src/domain/permissions.js:148–177` 对既有 grant 可 allowed-once、可按设置拒绝不完整参数或转交。禁审批、提示「不要执行」或不展示工具都不能证明没有读写、外联、委派等副作用。

**普通结案通知不是顾问收据。** `C/src/wire/sessions.js:62–113` 的 createSessionSource/finalTextOf/factsOf/settle 等整棵树静止，倒扫根会话**全部**事件取最后非空助理文本；管理者主动 stop 被略过，待报状态只在内存。`C/src/wire/sessions.js:120–127` 同根的较晚结束可覆盖尚未报告的结束。`C/src/routing/index.js:147–149` 发出普通 turn-finished，correlationId=null；[interception.js:224–248](<../../packages/core/src/events/interception.js#L224-L248>) 的接收分派以及 [persona.js:97–100](<../../packages/core/src/persona.js#L97-L100>) 面向普通 worker。第二问无文本时可能拿到第一问；重启前没发出的静止通知可能不存在。`C/mcp-schema/shapes.js:83–85` 的 readMessage 有 seq/role/author/text/images，没有本次咨询的请求或 turn 身份。不能轮询「最后回复」补成成功，亦不能同时交普通自动化和顾问消费两次。

## 3．RPC、处置和用量：不要混淆相近接口

| 现状证据 | 审计结论 |
|---|---|
| [index.js:215–245](<../../packages/core/src/bridge/index.js#L215-L245>)、[index.js:346–359](<../../packages/core/src/bridge/index.js#L346-L359>) 将发现的 inputSchema 映射给本地工具，允许的调用经 link.callTool 发出；`C/mcp-schema/constants.js:118–119` 的 scope 为 agent / agent:pair。`C/src/mcp/tools/dispatch.js:113–134` 将核心及扩展工具列给 full caller、按名称分派；`C/src/mcp/tools/sessions.js:39–64` 检查普通管理者和根会话。 | 本地允许列表不是服务端私有凭据。同 principal 的通用接口不区分「管理 worker」与「仅主机可操作某顾问」。在这些受核接口中无独立凭据、版本协商、start/follow-up/status/close 或按绑定恢复的日志。不能把公开扩展工具、隐藏名称或 start 新参数当私有 RPC。 |
| `C/src/domain/session-port.js:483–502` 的 stop 阻止当前活动（管理者路径含 stopTree）；`C/src/mcp/tools/handlers.js:94–108` 的 release 只调用 managed.release。`H/dsh-workspace/src/index.ts:381–420` 的 archiveSession 默认拒绝活动会话，写归档集合、去掉 pin，可选 stopActivity；unarchiveSession 可逆。 | stop ≠ 丢弃，release ≠ 归档，归档 ≠ 擦除历史。公开 schema 无 session discard/archive/永久删除或可验证的私有清理回执。提案的「归档」是候选语义；若实际要求 purge，不能以归档或直接删文件交差。 |
| `H/dsh-agent-loop/src/agent.ts:518–525`、`H/dsh-agent-loop/src/agent.ts:579–588` 只在 live.usage 存在时记入事件；`H/dsh-session-stats/src/projection.ts:94–105`、`H/dsh-session-stats/src/projection.ts:149–159` 读可选 outputTokens。`C/mcp-schema/shapes.js:63–85` 的模型/消息形状无价目或用量；`C/mcp-schema/tools.js:50–67` 的 start/message/read 以及上面的 turn-finished 不提供问次账单或强制输出上限。 | 有部分宿主遥测，不等于 connector 有逐请求的完整输入/输出/推理账单、预留或货币封顶。显示未知，不能填零；Fishball 自己处理建议的另一次推理不得算免费。 |

## 4．验收门（均未在本次执行）

采用可记录请求的假 provider、可靠的工具执行计数器、可注入故障的两个目标，不使用真实付费调用。任一必需项不能在实际 host 上证明，维持不可用，而不是降级为 worker。

1. **私有准入与披露。** 仅独立宿主能力可协商版本并操作绑定；普通 agent bearer 即使知道名称/ID 也不能经 MCP、扩展、通用 session 工具访问顾问。另一主体、错误 endpoint epoch、能力缺失、未明确选择有效 route 或无权向该目的地披露问题/证据/历史：零简报字节外发、零会话创建、零模型调用；不试普通 start。
2. **首轮竞态。** 从创建、挂载、attach、安装模型、管理、首投递逐点注入错误；并行 GUI submit / 插件 wake、重启冷恢复。验证门在发布前生效且覆盖所有入口；证明实际 owner、placement、preset、模型、权限前 provider 调用数为零。部分创建仅留下一个已封锁且可按原请求找回的 ID；丢回复不再建第二个。追问检查同样条件，拒绝重叠、路由变更与失权。
3. **分别验数据与动作。** 在 cwd 指令、技能目录、插件上下文、额外 inbox 和无关会话中放入不同标记；在首轮、追问、重试、冷恢复时捕获实际目标及完整组包，只含受控指令、已授权简报和同一主题获准历史，不含上述标记、附件或凭据。注册本 scope/动态工具、诱发模型返回 tool call：既无可用 schema，也无执行；读取、写入、shell/PTC、MCP、网络工具、message_agent、子代理、后台作业、权限升级均零副作用。仅允许已授权推理通道，不允许旁路模型调用。
4. **一次投递，一份结果。** 先持久绑定主体/目标/主题/请求 ID，再关联精确输入边界、宿主 turn 与起止游标；丢确认只查原目标状态、不重发。首问有答、次问为空、停止、失败、游标不明、重复/乱序/迟到、重启逐一验：只返回本问文本或明确 empty/stopped/failed/未决，标明截断，去重后只向 Fishball 交一次建议；普通 worker 仍走原路径。一次回答不关闭主题。
5. **关闭与丢弃。** 明确议定保留/擦除语义后才报告该能力。先持久标记 closing，封锁新投递/恢复，停止活动、使迟到回执失效；仍持有原授权时仅处置该绑定，确认后才 release，并保留关闭记录防止自动复开。停用功能或清空模型仍可无推理地清理；断连/未确认留 cleanup-pending，换主不再处置，重复 close 不影响其他会话。若要求永久丢弃，单测可恢复的 archive 不算验收成功。
6. **用量与预算。** 按请求关联实际 route、时间、已知用量与未知项；重复/并发/断线/重启不重扣或释放不确定预留。硬次数预算须在发送前持久原子预留；若声称 token/货币硬上限，须能在请求前界定全部可计费历史、输入、推理及强制输出上限，金额另需适用价格。缺边界或价格不得按硬限额放行；无法取得实际用量保留上界，不以文本大小折价，管理者费用分列。
