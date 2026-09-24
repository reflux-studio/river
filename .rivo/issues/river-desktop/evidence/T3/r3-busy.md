# T3 第 3 轮：业务写与 Mastra 写的锁冲突（R1）实验

环境：@libsql/client 0.18.0（libsql 0.5.29）、@mastra/libsql 1.23.1、Node 24.19.0、macOS arm64。探针在 scratchpad，跑完已删除。

## 探针设计

- 同一 `river.db`：业务侧 `river_kv` upsert；Mastra 侧 `LibSQLStore` 的 memory 域循环 `saveThread → saveMessages(30 条) → updateResource(working memory) → deleteMessages`（`deleteMessages` 是跨多个 await 持锁的交互式写事务）。
- 业务：4 个 worker 各 500 次写，写之间只让出微任务（`await Promise.resolve()`），制造与 Mastra 事务的交错。只让出宏任务（setImmediate）时，Mastra 本地操作全部在一个宏任务内完成，业务写根本插不进去（150 轮只写入 4 次，0 冲突）。
- 模式：`shared`＝`LibSQLStore({ id, client })` 共用业务 client；`separate`＝`LibSQLStore({ id, url })` 各自建 client。重试：`0` 不重试；`1` 仿 Mastra，5 次、100ms 起翻倍，仅 BUSY/LOCKED；`recreate`＝重试且每次 BUSY 后关闭并重建业务 client。
- 结束后用**全新连接**读回，核对每个 key 的最后值（persistedMismatch）与 working memory。
- 阻塞测量：每次 BUSY 从发起到被拒绝的耗时（maxBusyRejectMs）；`monitorEventLoopDelay` 的最大值。

## 结果（ITER=300，业务 2000 次写）

| 模式 | 业务成功/失败 | Mastra 成功/失败 | 新连接读回不一致 | BUSY 拒绝耗时 | 事件循环最大延迟 |
| --- | --- | --- | --- | --- | --- |
| shared，不重试 | 527 / 1473 | 1 / 299（`cannot commit transaction - SQL statements in progress`） | 50/50 | 0.59 ms | 6.6 ms |
| shared，重试 | 2000 / 0（4 次重试） | 300 / 0 | 0/50 | 0.27 ms | 0 |
| separate，不重试 | 526 / 1474 | 1 / 299（同上） | 50/50 | 1.76 ms | 6.3 ms |
| separate，重试（不重建） | 2000 / 0（4 次重试） | 300 / 0 | **50/50：调用全部成功，数据一条都没落库** | 0.26 ms | 0 |
| separate，重试 + BUSY 后重建 client | 2000 / 0（4 次重试） | 300 / 0 | 0/50 | 0.55 ms | 0 |

原始输出：

```
{"mode":"shared","retry":false,"ms":243,"bizOk":527,"bizFail":1473,"bizRetried":0,"maxAttempts":1,"bizErr":["SQLITE_BUSY SQLITE_BUSY: database is locked"],"mastraOk":1,"mastraFail":299,"mastraErr":["SQLITE_BUSY: cannot commit transaction - SQL statements in progress"],"slowestBizMs":1,"maxBusyRejectMs":0.59,"loopDelayMaxMs":6.6,"loopDelayP99Ms":6.6}
{"mode":"shared","retryArg":"0","persistedMismatch":50,"keys":50,"wmSeenByFreshClient":"# wm 0"}
{"mode":"shared","retry":true,"ms":315,"bizOk":2000,"bizFail":0,"bizRetried":4,"maxAttempts":2,"bizErr":[],"mastraOk":300,"mastraFail":0,"mastraErr":[],"slowestBizMs":292,"maxBusyRejectMs":0.27,"loopDelayMaxMs":0,"loopDelayP99Ms":0}
{"mode":"shared","retryArg":"1","persistedMismatch":0,"keys":50,"wmSeenByFreshClient":"# wm 299"}
{"mode":"separate","retry":false,"ms":5612,"bizOk":526,"bizFail":1474,"bizRetried":0,"maxAttempts":1,"bizErr":["SQLITE_BUSY SQLITE_BUSY: database is locked"],"mastraOk":1,"mastraFail":299,"mastraErr":["SQLITE_BUSY: cannot commit transaction - SQL statements in progress"],"slowestBizMs":5367,"maxBusyRejectMs":1.76,"loopDelayMaxMs":6.3,"loopDelayP99Ms":6.3}
{"mode":"separate","retryArg":"0","persistedMismatch":50,"keys":50,"wmSeenByFreshClient":"# wm 0"}
{"mode":"separate","retry":true,"ms":232,"bizOk":2000,"bizFail":0,"bizRetried":4,"maxAttempts":2,"bizErr":[],"mastraOk":300,"mastraFail":0,"mastraErr":[],"slowestBizMs":222,"maxBusyRejectMs":0.26,"loopDelayMaxMs":0,"loopDelayP99Ms":0}
{"mode":"separate","retryArg":"1","persistedMismatch":50,"keys":50,"wmSeenByFreshClient":"# wm 299"}
{"mode":"separate","retry":true,"ms":279,"bizOk":2000,"bizFail":0,"bizRetried":4,"maxAttempts":2,"bizErr":[],"mastraOk":300,"mastraFail":0,"mastraErr":[],"slowestBizMs":257,"maxBusyRejectMs":0.55,"loopDelayMaxMs":0,"loopDelayP99Ms":0}
{"mode":"separate","retryArg":"recreate","persistedMismatch":0,"keys":50,"wmSeenByFreshClient":"# wm 299"}
```

## 关键发现：libsql 0.18 出错后的连接会“静默丢写”

最小复现（两个 client，B 开写事务占锁，A 写入）：

```
first SQLITE_BUSY
second ok rowsAffected 1
read same client 1
read other client 0
```

A 第一次写得到 `SQLITE_BUSY`；B 放锁后，A 在同一 client 上再写**返回成功**（rowsAffected 1），A 自己能读到，另一个连接读不到。原因：`executeStmt` 里 `db.prepare(sql).run()` 抛错后语句没有被重置，连接停在未提交的隐式事务里；之后的写入都进了这个事务，并一直持锁。换成 `batch` 时，重试会直接报 `cannot commit transaction - SQL statements in progress`。不重试时 Mastra 299/300 失败，也是因为被污染的业务连接一直持锁。

推论：
1. 只做异步重试不够：重试必须换一条干净连接。`@libsql/client` 连接池不支持单独驱逐某条连接，只能关闭整个 client（`close()` 关闭全部连接，未提交的内容随之回滚）。
2. 共用 client 时不能这样做：关闭会打断 Mastra 正在进行的事务。“shared，重试”这一行读回一致，只是这次被污染的连接恰好又被 Mastra 的事务提交了，不可依赖。
3. 所以业务层与 Mastra **各建 client、共用同一个文件**（仍符合 ADR-003 的单文件方案）。业务 client 不设 `busy_timeout`，BUSY 立即返回（< 2 ms），异步退避，不阻塞事件循环。
4. 业务写都是单条 `execute` 或 `batch`，在一次同步调用里完成，不跨 await 持锁；BUSY 后被污染的连接在同一个同步 catch 里就关掉。因此 Mastra 不会因业务侧持锁而 BUSY；它自己连接上的 `busy_timeout`（5000/10000）也就不会同步等待。

Mastra 自己的 client：`LibSQLStore({ url })` 会设 WAL、busy_timeout 5000 等 PRAGMA，写入按 client 串行化（`withClientWriteLock`）。传 `client` 时它把 `isLocalDb` 当作 false，跳过这些 PRAGMA。

补充核对：共用 client 时，逐条查看连接池里 6 条连接的 `PRAGMA busy_timeout`，都是 0；Workflows 构造函数里设 10000 的那一句没有落到可观测的连接上。

## 修复与验证

- `src/main/db/index.ts`：`withRetry` 遇 BUSY/LOCKED 时关闭并重建业务 client，按 100/200/400/800 ms 退避，最多 5 次。所有写入与迁移都走它。写队列清空后如果有写最终失败，从库重载 settings、lobby、providers 缓存；重载期间有新写入入队时，等它们落库后再重载一次。
- 不提供共用 client 的入口（不导出 `getClient`）。T4/T5 用同一个 url 构造 `new LibSQLStore({ id: 'river', url })`。
- 测试：`test/db-mastra.test.ts`：同文件 LibSQLStore 并发重负载，用新连接核对业务与 Mastra 数据都落库，重启后缓存与库一致。`test/db.test.ts`“写锁冲突”：锁在重试期间释放则写入成功；锁一直不放时，4 种写入全部以 SQLITE_BUSY 拒绝，缓存回到库中值，等待期间事件循环最大间隔 < 100 ms。
- 变异检查（见下）：去掉“BUSY 后重建”或去掉重试，两个并发/释放测试都会失败；去掉缓存重载，最终失败测试会失败。

```
## M1 保留重试、去掉 BUSY 后换 client
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  test/db-mastra.test.ts > 与同文件的 LibSQLStore 并发写入时，业务写与 Mastra 写都落库
 FAIL  test/db.test.ts > 写锁冲突 > 锁在重试期间释放则写入成功
      Tests  2 failed | 16 passed (18)
## M2 去掉重试
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  test/db-mastra.test.ts > 与同文件的 LibSQLStore 并发写入时，业务写与 Mastra 写都落库
 FAIL  test/db.test.ts > 写锁冲突 > 锁在重试期间释放则写入成功
      Tests  2 failed | 16 passed (18)
## M3 最终失败后不重载缓存
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  test/db.test.ts > 写锁冲突 > 重试耗尽后抛出 SQLITE_BUSY，缓存回到库中的值
      Tests  1 failed | 17 passed (18)
```
