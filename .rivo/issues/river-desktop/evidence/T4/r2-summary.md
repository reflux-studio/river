# T4 第 2 轮修复证据（对应 reviews/T4-1.md）

`pnpm test`：8 个文件 83 例全过（r2-test-output.txt）；`pnpm typecheck` exit 0（r2-typecheck.txt）；T4 用例见 r2-cases.txt。

| 项 | 修改 | 用例 |
| --- | --- | --- |
| F1 | `leak.ts` 先截到 40 字再检查，删去错误理由 | leak.test.ts「截断造出的新边界也算泄牌」（5d +“…加50”、As +“…拿AK”，另有未截断的“加50”正例） |
| F2 | `tools.ts` 导出 `opponentTools`/`coachTools`，两个 agent 分别注册；角色专属工具在 execute 中校验 role | agents.test.ts「对手 agent 调用 view_hero、recent_hands 不会执行」「两个 agent 各自只注册本角色的工具」「越权调用按 role 拒绝」 |
| D1 | `types.ts` `HandLogEntry.board` 改为 `boolean`；夹具同步；`heroHandSummary` 按 `x.board` 判断，删除过时注释（F5） | views.test.ts、db.test.ts |
| F3 | 当前任务为 durable 时，抢占既不中止它也不越过它，等它结束 | queue.test.ts「durable 当前任务超过 2 秒也不被越过」 |
| F4 | `QueueTask.fn` 注释写明 signal 可能开始前就已 aborted | queue.test.ts「开始前已被抢占…」 |
| F6 | 补全 proactive、ask 的工具列表断言 | agents.test.ts coach 用例 |
