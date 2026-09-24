# 004：Mastra 不再使用存储，业务层独占 river.db（取代 river-desktop ADR-003）

状态：提议（2026-09-24。由用户 A2“长期记忆可有可无，代码要简洁”推出；AI 已向用户说明“这会推翻上一轮的架构决定”，用户答复“其他的你看着办吧”）
日期：2026-09-24

## 背景与问题

v2 中对手每回合只做一次 `act` 调用、不带会话历史；长期记忆改为代码维护的短文档（`river_memory`）；教练问答的本桌对话历史由 TableRunner 保存并在调用时传入。Mastra 的 thread、message、working memory 都不再被读写。ADR-003 为“业务层与 Mastra 共用一个文件”付出的写入纪律（各自 client、BUSY 时重建 client）随之失去对象。

## 可行选项

| 选项 | 说明 |
| --- | --- |
| A. 去掉 `@mastra/memory`、`@mastra/libsql`，Agent 不注册进 `Mastra` 实例、不配存储 | 依赖与启动顺序最简单；`river.db` 只有业务层一个写入方 |
| B. 保留 LibSQLStore 但不用 | 无收益，仍要维护初始化顺序与写入纪律 |

## 决定与理由

采用 A。已核实（`reviews/design-2.md` F4）：`Agent.generate/stream` 可直接接受消息数组作为对话历史；独立 Agent 不需要存储（`models/resolve.ts` 的连接测试已是这种用法）；不注册进 `Mastra` 也就不会出现“未配置存储，退回内存”的警告。

## 后果与重新考虑条件

- 业务层 `write()` 的串行写链保留（它解决的是基于缓存的读-改-写互相覆盖，与 Mastra 无关）；BUSY 处理保留退避重试，但不再需要为 Mastra 争锁而重建 client 的理由，是否简化由实施任务按实测决定。
- WAL：此前由 LibSQLStore 设置；改为业务层初始化时显式 `PRAGMA journal_mode = WAL`，新老库一致。
- 旧库中的 `mastra_*` 表不删除、不读取（删除不可逆，且只占少量空间）；旧的对手印象、教练学员档案、问答记录不迁移。
- 不支持降级：旧版本打开新库会继续使用 `mastra_*` 表，但读不到 `river_memory`。
- ADR-002 第 15 行“印象与漏洞由 agent 通过 working memory 工具自行更新”不再成立：改为 `act`/`recap` 的可选 `note` 由代码写入 `river_memory`。
- ADR-001 的决定不变；其理由“工具在同进程直接读引擎”在 v2 中弱化为“TableRunner 在同进程拼局面文本”，主进程唯一写入者与信息隔离仍然成立。
- 重新考虑：需要语义检索或跨会话长上下文（例如“分析最近 100 手”）时，再引入 Mastra Memory 并单独存储文件。

## 依据

`../discussion.md` 第 4 轮 §2、§8；`../reviews/design-2.md` F3、F4；`@mastra/core` 1.69.0 `agent/agent.d.ts` 第 1230–1245 行。
