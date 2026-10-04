# BUB007A — fishball extraction, portability and license

Current alias: **DF007A**. Historical BUB IDs and approved source text below remain preserved. The [owner amendment](../owner-amendment-2026-10-04.md) controls current naming, MIT and chat-provider applicability.

Status: planned.
Wave: W3 gated by license/source choice.
Source AC IDs retained: BUB007-01..02.
Planning source: Library libfile_13cd8b7e548881919b22d9e99bfddaf2; [complete approved text](../reference/approved-ticket-review.zh.txt).
No remote issue exists for this card.

## Development gates
Triage/AC → logical-unit implementation commits → independent code review → separate ISTQB test review → actual supported functional/visual validation → fixes/retest → report → local squash convergence. Source acceptance remains pending until evidenced. BUB015 does not replace this process.

007A owns original BUB007-01 and02 only: portable runtime reuse and redistribution license. Original007B criteria remain on the separate007B card.

## Current owner host baseline

Use exact official DSH Web 0.2.1-alpha.1 in project-local isolation, with loopback browser acceptance and no old Desktop shims or Electron/native-shell validation. [Compatibility and source-AC interpretation](../compatibility.md) applies to this ticket. Original source AC below are preserved; newer explicit owner host decisions supersede older baseline advice. Future breaking upgrades require explicit reassessment rather than floating dependencies during tests.

## Approved source scope and acceptance

BUB007 fishball 记忆代码整合
目标 复用已有 MemoryStore 的价值，为 bubbles 提供隔离、可纠正、可检索且不承载权限的长期记忆。
范围 007A 做代码抽取、许可证确认与移植 spike；007B 做隔离存储、检索、事实抽取、编辑删除和上下文适
配。排除整套 fishball 应用、未经批准共享现有个人数据以及凭据记忆。
依赖 007A 可与底座并行；007B 依赖 003、006、008 和 007A 的通过证据。
预期行为 目前 Store 是 Kotlin/JVM 内嵌代码，不是已发布的独立库。建议先抽取共享模块，比较 JVM 与
Kotlin/JS ESM 的接入代价。主分支 JSON snapshot 与缓存 release 的 revisions、turns.jsonl 差异都要覆
盖；检索与事实抽取在 Store 外，需要另接适配层。
验收标准
BUB007-01 007A 在真实插件运行环境完成编译、加载、写入、重读和迁移测试；说明支持的目标与缺口，不
能以 Kotlin 支持 JS 代替项目实际可移植证据。
BUB007-02 007A 确认代码及依赖的再分发权。未找到受跟踪许可证时，公开发布保持阻塞；不能以 owner
可读源代码推断可开源再分发。
BUB007-03 007B 使用 bubbles 独立的 owner 与 workspace 命名空间；相同检索词不能返回别的空间数据，
默认没有现有 fishball 数据导入。
BUB007-04 007B 对所有读写和恢复失败可观察；原代码抑制持久化错误的行为须被适配或修正，不能向用户
写已保存却只留在内存。
BUB007-05 007B 记忆保留来源、时间、置信度及修订关系；用户纠正或删除后，缓存与检索不继续使用旧
值；秘密不进入事实抽取。
BUB007-06 007B 任务终态与批准仅从账本读取。冲突记忆只能触发核查，不能覆盖用户最新指示，也不能批
准动作。
异常与竞态 截断 snapshot、JSONL 尾部损坏、版本错配、写盘失败、重复事实与相反事实并存、导出后再导
入、跨 owner 同名。
评审结论 拆成 A 与 B 两个子阶段有必要。先验证复用是否成立，再做产品集成；建议优先保留可测试的 Store
核心，不为移植强行复制 Android 依赖。
统一待决项 D7 抽取路线与许可证处理；D4 记忆保留、导入及删除策略。

## Milestone evidence
Not implemented; no tests/audits/runtime validation claimed.
