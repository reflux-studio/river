# 003：Mastra 存储与业务数据共用一个 SQLite 文件

状态：接受（用户决定使用 Mastra storage 的 SQLite，2026-09-23；表结构划分为 AI 补充）
日期：2026-09-23

## 背景与问题

原型把设置、手牌历史、余额、角色提示词存在 localStorage。桌面版需要持久化这些数据，以及 agent 的会话与 working memory。Mastra storage 只提供自身领域的表，不提供通用业务表。

## 可行选项

| 选项 | 说明 |
| --- | --- |
| A. 一个 `river.db`：Mastra 表 + `river_*` 业务表 | 单文件备份与清理；业务表用 `@libsql/client` 直接读写 |
| B. Mastra 一个库，业务数据另存 JSON 或第二个库 | 两套持久化，清空、迁移分别处理 |
| C. 业务数据塞进 Mastra resource metadata | 滥用 memory 语义，查询统计困难 |

## 决定与理由

采用 A。满足用户“用 SQLite”的决定，只依赖一个存储引擎和一个文件。API key 以 Electron `safeStorage` 加密后存入 `river_providers`。

## 后果与重新考虑条件

业务表需要自己维护简单的建表与版本号迁移。Mastra 升级若改变表结构，不影响 `river_*` 表。

实施中发现（2026-09-24，T3，证据 evidence/T3/r3-busy.md）：同一文件的两个写入方会争写锁，且 `@libsql/client` 0.18 在 `SQLITE_BUSY` 后会让连接滞留未提交事务、造成静默丢写。因此业务层与 Mastra 各自建 client，业务写遇 BUSY 时重建自己的 client 后退避重试；WAL 由 LibSQLStore 设置。单文件的决定不变，但它依赖这一写入纪律。
重新考虑：需要跨设备同步时改用远程 libSQL（Turso）；升级 `@libsql/client` 后需重新验证静默丢写问题；若新增其他写入方（进程或连接）导致 Mastra 遇到 BUSY，考虑把 Mastra 存储拆到独立文件（需重新决策）。

## 依据

`note.md`“业务数据存储”；`@mastra/libsql` 文档 integrations-databases-libsql。
