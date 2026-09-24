# 简化轮复审 simplify-2

## 方式、范围与版本

| 项 | 内容 |
| --- | --- |
| 模式 | 修复复审（针对简化轮），独立审阅者。没有派发子代理，也没有修改实现 |
| 范围 | `git log 1e5fa45..HEAD`（18 个提交，HEAD `9f6e685`）与 `git diff 1e5fa45..HEAD` |
| 依据 | `reviews/simplify-1.md`（发现与“建议不动”清单）、`evidence/simplify/record.md`、`task.md` 各任务结果段、`note.md`、`plan.md` |
| 标准 | 玩具项目：架构清晰、有复用、核心逻辑与体验保证不丢 |
| 探针 | scratchpad `s2/`：`repo/` 是仓库副本（node_modules 链接到原仓库），`mut.sh` 是变异脚本，`typecheck.txt`、`test.txt`、`build.txt` 是命令输出。仓库内没有写入任何文件（本报告除外） |

## 结论：通过（附 1 条需要决定的契约偏差）

18 个提交落实了 simplify-1 建议本轮做的 #1–#4、#6–#15、#17、#18，以及“顺带发现”里的 `reloadSettings`。#5（db 写缓存）和 #16（key_tail 迁移）没有动，与建议一致。核心保证都在，“建议不动”清单里的代码一行没改。四处契约一致，没有遗留旧事件或死代码。改写后的测试对关键改动仍能区分对错。

需要决定的一条是 F1：`heroAct` 在没有 `to` 时回退到 `minTo`，和 task.md 已接受的约定“加注无金额用默认加注额”不一致。目前没有调用方省略 `to`，所以不影响实际行为；但约定和代码应该对齐。另有 3 条低优先级观察（O1–O3）。

## 命令结果

| 命令 | 结果 |
| --- | --- |
| `pnpm typecheck` | 通过（exit 0） |
| `pnpm test` | 10 个文件、111 个用例全部通过（exit 0） |
| `pnpm build` | 通过（exit 0） |
| `git status` | 工作区干净 |

## 1. 核心保证

| 保证 | 结论 | 依据 |
| --- | --- | --- |
| 信息隔离：TableView / bootstrap / hands | 保持 | `view.ts` 的 `revealed`/`show` 规则没变。bootstrap 现在直接带 `view`，IPC 用例对整个 bootstrap JSON 断言不含对手底牌和 `sk-`，所以也覆盖了 view。变异 M5（view 无条件带 `cards`）会让“完整牌局”和“IPC”两条用例失败 |
| 对手/教练工具隔离 | 保持 | `tools.ts` 只把 `speaker` 改成用 `personaOf`，`allow()` 没动。`buildSeatView` 的名字和标签改为内部计算，隔离断言 `assertIsolated` 原样保留 |
| 泄牌过滤 | 保持 | `agents/leak.ts` 没有改动 |
| 同一 agent 串行与抢占、每手结果 durable | 保持 | `agents/queue.ts` 没有改动。`onHandEnd` 里的 durable `appendResult` 没动，对应用例仍在 |
| 计时器赛跑 | 保持 | `guarded` 函数体没改 |
| db BUSY 保护与 generation | 保持 | `db/index.ts` 只有 `listHands` 多返回 `vpip`/`pfr` 两个字段 |
| 自动下一手等 ask 与赢家发言 | 保持 | `maybeAutoNext` 没动。`nextHand` 原来在破产检查之前清 `autoTimer`/`autoHand`，现在移到检查之后（并入 `resetHandState`）。自动下一手只在玩家筹码大于 0 时排定，破产分支不会有在途的 autoTimer，所以等价 |
| heroKey 去重 | 保持 | `onHeroTurn` 里 `key === this.heroKey` 的判断没改，只删掉了 defaultRaiseTo 的计算 |
| `resetHandState` / `resetTableState` 字段集合 | 等价 | 逐项对照：原 `resetTableState` 的 19 个字段，加上新增的 `alert = null`（替代原来 `leave` 里的 `setAlert(null)`），与现在两者的并集相同；原 `nextHand` 手动重置的字段都在 `resetHandState` 里 |
| “建议不动”清单 | 没有改动 | `withRetry`/generation、`mastra.ts` 的 LibSQLStore、`queue.ts`、`guarded`、`allow()`、两份 views 分文件、`deciding/pendingAI/heroKey/endKey/autoHand`、`spike.ts`、`lastCall`/`autopilotCount`、`filterSay`、`hotkeys.ts` 都不在 diff 里，或只有 import 变化 |

alert 从“立即发事件”改成“随视图广播”之后，逐一核对了每个赋值点后面是否有广播：`start` 在 `nextHand → loop` 里广播；`nextHand` 由 `loop` 广播；`coachProactive` 结果之后第 408 行广播；`leave` 推 `table:view null`。都没有漏掉。熔断改成在 `countFailure` 触发时调用 `broadcast()`，`retryModels` 也会广播。

## 2. 契约变更的四处一致性

| 契约 | main | preload | shared | renderer |
| --- | --- | --- | --- | --- |
| `coach.ask(requestId, text)` | `ipc.ts` 传两个参数；`runner.ask` 不再生成 id，`reject` 同步推送 | 泛型转发，无需改动 | `Commands['coach.ask']` 返回 `void` | `askCoach` 先用 `crypto.randomUUID()` 写入提问和 pending 回答，再调用命令；失败时把回答标成 failed 再抛出，由 CoachPanel 的 `toastError` 提示 |
| breaker / alert 并入 TableView | `ViewState.alert`，`buildTableView` 输出 `breaker`、`alert`；`breaker`、`coach:alert` 事件和 `replay()` 已删除 | 同上 | `Events` 删了两个事件，`TableView.alert` 已加 | `Table.tsx` 读 `view.breaker`，`CoachPanel` 读 `v.alert`；`RiverState.alert/breaker` 已删除 |
| bootstrap 返回 view | `view: runner.view()`，`setImmediate(replay)` 已删除 | — | `Bootstrap.view` 替代 `hasTable` | `init()` 写入 `view`；`hasTable` 全部改为 `view !== null` |
| `HandSummary.vpip/pfr` | `listHands` 从已解析的记录里取 | — | 已加字段 | `Stats` 只调一次 `hands.list` |
| settings 由命令返回 | `provider.delete`、`table.start` 返回 `getSettings()` | — | 两个命令的返回类型改为 `Settings` | `deleteProvider`、`startTable` 直接写入；`reloadSettings` 已删除 |

在 `src` 里 grep `coach:alert`、`'breaker'` 事件、`hasTable`、`replay()`、`reloadSettings`、`cardParts`、`cardText`、`coachConfigured`、`GUIDED`、`getState`、`useBootstrap`，都没有残留（`'breaker'` 只作为 `coach:done` 的 error 取值出现）。

**页面重载恢复**：bootstrap 的快照在最后一个 `await` 之后同步组装，其中 `view`、`chat`、`coachThread`（包含在途回答已有的文本）、`bankroll`、`lastCall` 是同一时刻的状态。renderer 先 `listen()` 再 `invoke`。

**快照与推送的竞态（执行者提到的）可以接受**：

```
main:   ...事件A...  [await 结束 → 同步组装快照 → reply]  ...事件B...
render: listen() ── 收到A（写入旧状态）── 收到 reply → setState(快照) ── 收到B
```

- 事件 A 发生在快照之前，它的效果都已经包含在快照里，会被快照覆盖（chat 按 id 去重，view、bankroll 取最新值）。唯一的损失是 A 中的 `coach:delta` 写到了空的 `coach` 上，但快照里的 `coachThread` 已经包含这段文本，所以没有影响。
- 事件 B 与 reply 走同一条 IPC 通道，按顺序到达；reply 之后的 `await` 续体都是微任务，会在 B 的消息任务之前执行，所以 B 一定落在快照之后。
- 这和原来 `setImmediate(replay)` 的方案相比，少了一个“重载后到补发之前 view 为空”的窗口。执行者的冒烟第 3 步实际验证过重载后可以恢复并继续操作。

## 3. 改写的测试能否区分对错（副本中的变异）

| 变异 | 位置 | 结果 |
| --- | --- | --- |
| M3 bootstrap 返回 `view: null` | `ipc.ts` | 被捕获（IPC 用例） |
| M4 视图里的 `alert` 恒为 null | `view.ts` | 被捕获（pause 用例、教学牌局用例） |
| M5 视图无条件带对手底牌 | `view.ts` | 被捕获（完整牌局、IPC） |
| M9 `listHands` 漏掉 vpip/pfr | `db/index.ts` | 被捕获（db 手牌用例） |
| M10 `disp` 的红色判断 / M10b `txt` 不转 10 | `shared/format.ts` | 被捕获（与原型对照的 200 手用例） |
| M11 座位视图 tag 恒为空 | `agents/views.ts` | 被捕获（buildSeatView 字段用例） |
| M12 `provider.delete` 返回删除前的设置 | `ipc.ts` | 被捕获（IPC 新增断言） |
| M2 熔断触发时不立即广播 | `runner.ts` countFailure | **没有捕获**，见 O1 |
| M1 非教学手不清 alert | `runner.ts` nextHand | 没有捕获（基线同样没有覆盖） |
| M6 `resetHandState` 移到破产检查之前 | `runner.ts` nextHand | 没有捕获（基线同样没有覆盖，见 O3） |
| M7 defaultRaiseTo 的 2.5 倍改成 2 倍 | `view.ts` | 没有捕获（基线同样没有覆盖，见 F1） |
| M8 `resetTableState` 不清 alert | `runner.ts` | 没有捕获，但它是等价变异：`start` 随后总会给 alert 赋值，`leave` 之后视图为 null |
| M13 `fmt` 用 floor 代替 round | `shared/format.ts` | 没有捕获；引擎金额都是整数，没有实际影响 |

结论：coach.ask、bootstrap/view、alert、HandSummary、settings 返回、格式化合并这些关键改动，都有能区分对错的用例。

## 4. format 合并、defaultRaiseTo 与 heroAct

- `shared/format.ts` 里的 `disp`/`txt` 和原来 engine 中的实现逐字相同。`engine.test.ts` 改为从 shared 导入 `disp`，与原型对照的用例仍然通过；M10/M10b 证明对照用例能发现偏差。`fmt`、`signed` 和原来的三份实现相同。
- `defaultRaiseTo` 移到 `buildTableView` 后，公式 `clamp(currentBet === 0 ? r(total*0.5) : r(currentBet*2.5))` 与原型 `River.dc.html:513` 一致，`clamp` 就是原来的 `max(minTo, min(maxTo, x))`。它现在每次广播都会重新计算，而原来只在 `onHeroTurn` 算一次；但轮到玩家期间局面不变，ActionBar 也只在 `isTurn` 时读取，所以结果相同。

### F1（需要决定，低风险）heroAct 缺 `to` 时的回退改变了已约定的语义

`runner.ts:437` 从 `a.to ?? this.defaultRaiseTo` 改成了 `a.to ?? L.minTo`。task.md:451 记录的已审阅偏差是“加注无金额用默认加注额”，而这里改成了最小加注额，语义已经变了。

目前 ActionBar 和热键都会传 `to`，所以用户看不到区别。但 `Commands['table.heroAct']` 仍然把 `to` 声明为可选，测试辅助 `drive()` 在 pick 返回 `'raise'` 时也会省略 `to`，以后有人依赖这个默认值时就会拿到 minTo。建议二选一：

1. （推荐，改动更少也更清楚）把命令类型改成 `{ type: 'fold' | 'call' } | { type: 'raise'; to: number }`，删掉回退，并在 task.md:451 注明“加注金额由 renderer 提供”。
2. 保留可选 `to`，把默认额的计算抽成 view.ts 导出的函数，让 `heroAct` 复用。

无论选哪种，都要同步 task.md。

## 观察（不影响通过）

### O1 熔断触发的即时广播失去了测试保护

原来的用例等待 `breaker` 事件，而这个事件只在触发时发出，所以能发现“触发了但没有推送”。现在改为 `drive(h, () => h.views.some(v => v.breaker.opponent))`，之后任何一次广播都能满足条件，M2 删掉 `countFailure` 里的 `broadcast()` 后用例仍然通过。实际影响很小：对手熔断后紧接着的托管行动会广播，教练熔断的两条路径在 `countFailure` 之后也都会广播，横幅最多晚一步出现。如果要补，可以在 `countFailure` 触发后立即断言 `h.views.at(-1).breaker.opponent`（一行）。

### O2 alert 在下一手清除没有用例

M1 没被捕获，基线同样没有覆盖。这属于体验层面：上一手的提示如果留到下一手，会误导玩家。可以在“proactive 返回 pause”用例末尾加一行，断言下一手 `alert` 为 null。不补也可以。

### O3 `nextHand` 注释里的不变量没有测试

`runner.ts` 新增的注释“须在破产检查之后：破产时保留 endKey…”属于应当保留的不变量说明，内容也正确。但 M6 把顺序颠倒后没有用例失败（基线也一样）。它记录了一个容易被误改的约束，玩具项目有注释就够了；如果之后再动 `nextHand`，建议补一条“玩家破产 → resume 不会重复结算”的用例。

## 未验证项

- UI 冒烟没有重跑，采信执行者的 `evidence/simplify/smoke.json` 和截图（重载恢复、Stats 读 vpip/pfr、离桌后隐藏入口）。
- `startGuided` 现在传 `{ ...state.lobby, guided: true }`，主进程在 guided 模式下会忽略桌型参数（`runner.start` 固定为 3 人桌、`['bai','zen']`、0 档盲注），IPC 用例也验证了这一点；renderer 这一侧没有单独验证。
