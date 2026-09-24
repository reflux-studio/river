# 过度设计审查 simplify-1

范围：HEAD 1e5fa45 的 `src/**`（main、shared、preload、renderer）与 `test/**`。只看复杂度，不找功能 bug。
依据：note.md 中的 T1/T3/T4 约束、task.md 对 spike 的安排（保留到 T9）。

总体判断：主进程核心（db 写链、AgentQueue、TableRunner、views）的“厚”大多有实测或约束支撑，可删的不多。收益主要集中在三处：renderer 里没用到的 shadcn 组件；同一份数据走了两条通道（breaker 同时在事件和视图里，coach.ask 为了“事件比返回值先到”加了暂存）；格式化函数与类型在 main/shared/renderer 各有一份。

## 发现（按收益从高到低）

| # | 位置 | 删什么 / 改成什么 | 替代方案（复用什么） | 预计删减 | 风险 |
|---|------|------------------|---------------------|---------|------|
| 1 | `src/renderer/src/components/ui/{badge,card,scroll-area,slider,tooltip}.tsx`；`App.tsx:2,23,31` | 删掉这 5 个没有任何引用的 shadcn 组件，以及只包了一层、没有 `Tooltip` 可用的 `TooltipProvider` | 需要时再 `shadcn add` | 约 −320 | 低 |
| 2 | `lib/river.ts:99-133,203-219`（`early`、`asking`、`hasAnswer`、`early` 分支）；`runner.ts:419-432`（`reject` 里的 `setImmediate`）；`types.ts:230` | 改为 renderer 自己生成 requestId（`crypto.randomUUID()`），先把“提问 + pending 回答”写进 state 再调用 `coach.ask(id, text)`。这样 delta/done 一定能找到对应条目，暂存 map、计数器和“事件必须晚于命令返回”的约定都可以删掉 | 平台自带 `crypto.randomUUID`；已有的 `patchCoach` | 约 −30 | 低～中：`runner.test.ts:266` 要改写（它断言“命令返回后才推”，改后这个约定不再需要） |
| 3 | `table/view.ts:25,119`、`types.ts:174`（`TableView.breaker`）与 `types.ts:248`、`river.ts:37,57,119`、`runner.ts:158,215,655,759`（`breaker` 事件） | breaker 状态走了两条通道，renderer 只读事件那一份，`TableView.breaker` 没人用。保留一份即可。建议保留视图那份：`countFailure`、`retryModels` 之后都会 broadcast，横幅只在牌桌页出现，可以删掉 `breaker` 事件、`RiverState.breaker`、`replay()` 里的补发 | 已有的 `broadcast()` | 约 −12（只删 `TableView.breaker` 也行，约 −4） | 低：`runner.test.ts:122,131,257` 改为读 `h.views` |
| 4 | `ipc.ts:20-21`、`runner.ts:755-760`（`replay`）、`types.ts:243,254-255`、`river.ts:32,52,115,146`（`hasTable`）、`pages/Table.tsx:50` | 在 #3 基础上把 `alert` 也放进 `TableView`（`setAlert` 后都有 broadcast），bootstrap 直接返回 `view`。这样 `replay()`、`setImmediate` 补发、`coach:alert` 事件、`hasTable` 字段都可以删（`hasTable` 就是 `view !== null`），“先注册监听再 bootstrap”的约定也随之消失 | `buildTableView` 已是完整快照；invoke 回复与 `webContents.send` 走同一条 IPC 管道，顺序有保证 | 约 −30 | 中：影响 IPC 契约与 `runner.test.ts:225,247,477` 以及 T5 的 IPC 用例；需要确认 bootstrap 期间没有交错的 await |
| 5 | `db/index.ts:75-106,146-148`，以及 `updateSettings`/`updateLobby`/`saveProvider`/`setSupportsRequired`/`deleteProvider` | 现在的做法是“同步先改缓存，写失败后等队列清空再从库重载”，需要 `pendingWrites`、`cacheStale` 和 finally 里的重载分支来补偿。改成在写链内部基于已提交的缓存算出新值，写成功后再赋给缓存：串行化保证依然成立，缓存不会领先于库，失败也就不需要重载 | 已有的 `writeChain` | 约 −20（含两段说明注释） | 中：不涉及 T3 的 BUSY 重建 client。语义变化是写入期间 `getSettings()` 暂时拿旧值（几毫秒，调用方都已 await）；`db.test.ts` 的“重试耗尽后缓存回到库中的值”“并发互不覆盖”两条用例应能原样通过 |
| 6 | `engine/poker.ts:151-152,282`（`disp`/`txt`/`fmt`）；`agents/views.ts:57` 和 `table/view.ts:31`（两份 `signed`）；`renderer/lib/format.ts:5-10`（`fmt`/`signed`/`cardParts`/`cardText`） | 同一组格式化函数有三份。移到 `src/shared/format.ts`，engine、views、renderer 共用；renderer 的 `format.ts` 只留 `netColor`、`avatarBg` | shared 目录已被两端引用 | 约 −12 | 低：`engine.test.ts:227` 继续用原型对照校验 `disp` |
| 7 | `pages/Stats.tsx:7-12`；`db/index.ts:221-227`；`types.ts:87-94` | Stats 为了拿 vpip/pfr 逐手调用 `hands.get`（N+1 次 IPC，已有 ponytail 注释）。其实 `listHands` 已经对每条完整记录做了 `JSON.parse`，给 `HandSummary` 加上 `vpip`、`pfr` 两个字段，Stats 只调一次 `hands.list` 就够了 | 已有的 `listHands` | 约 −6，同时去掉 N 次 IPC 和 ponytail 注释 | 低 |
| 8 | `test/runner.test.ts`（18 处）、`test/chat.test.ts:31` 的 `await h.runner.init()` | 改由 harness 调用 `init()`（harness 改成 async，或者由 `setup` 一并完成） | `table-helpers.ts` | 约 −18 | 低 |
| 9 | `test/db.test.ts:9-25`、`db-mastra.test.ts:11-19,27-29`、`agents.test.ts:18,26-29,46-58`、`table-helpers.ts:48-62` | 四个文件各写了一遍“临时目录 + initDb + 清理”；`seeded` 在 agents.test 里也重复了一份。抽成 `table-helpers.ts` 里的一个 `tempDb()`，并复用 `seeded` | `table-helpers.ts` | 约 −20 | 低 |
| 10 | `types.ts:114-123`（`Legal`，注释写的是“与 engine 同构”）与 `poker.ts:58`；`poker.ts:60`（`Profile`）与 `Persona['profile']` | engine 本来就 import `shared/types`，直接 `import type { Legal }` 并删掉自己那份；`Profile` 改为 `Persona['profile']` | shared 类型 | 约 −4，外加一条注释 | 低 |
| 11 | `runner.ts:88,369,390-392`（`defaultRaiseTo` 字段及其计算）与 `table/view.ts:86-90`（`r`/`clamp`/presets） | 同一套取整和钳制逻辑写了两处。把 `defaultRaiseTo` 移到 `buildTableView` 里与 presets 一起计算。`heroAct` 缺 `to` 时的回退改为 `L.minTo`：现在没有任何调用方省略 `to`，ActionBar 和热键都会传 | `view.ts` 里已有的 `r`/`clamp` | 约 −6，外加一个字段 | 低 |
| 12 | `lib/river.ts:191-195`（`coachConfigured`）、`pages/Settings.tsx:21-25`（`configured`）、`components/Onboarding.tsx:32-36`（`modelLabel`） | “按角色找已选提供方”写了三份。在 river.ts 里合成一个 `modelOf(s, role)`，其余两处复用 | `river.ts` | 约 −8 | 低 |
| 13 | `table/chat.ts:14`（`personaOf`）、`table/view.ts:32`、`agents/opponent.ts:37`、`agents/tools.ts:15` | `PERSONAS.find` 写了四处。把 `personaOf` 移到 `shared/personas.ts` 统一使用 | shared | 约 −4 | 低 |
| 14 | `pages/Replays.tsx:119-120,143-165` | `reviewing`、`failed` 两个 Set 加一个 `toggle` 辅助函数，每次操作要成对更新。改成一个 `Record<number, 'loading' \| 'failed'>` | React state | 约 −10 | 低 |
| 15 | `runner.ts:181-201` 与 `233-241`；`runner.ts:155` 与 `214` | `nextHand` 手动重置的 8 个字段和 `resetTableState` 重叠；breaker 的重置字面量也写了两遍。抽出 `resetHandState()` 给两处调用，breaker 重置合成一行常量 | runner 内部 | 约 −10 | 低 |
| 16 | `db/index.ts:126-127,310-312,335`（`provider_tail:<id>` 存在 `river_kv`） | keyTail 放在 kv 表里，于是加载时要 join，保存和删除都要多写一条语句。加 `MIGRATIONS[1]`：`ALTER TABLE river_providers ADD COLUMN key_tail TEXT`，并入 providers 行 | 已有的迁移机制 | 约 −6 | 中：需要迁移；task.md:149 写明了 kv 方案，要同步修改文档 |
| 17 | `agents/views.ts:30`（`buildSeatView` 的 `nameOf`/`tagOf` 回调） | 只有一个真实调用方（runner.ts:704），两个回调都能从 `g.players` 和 `PERSONAS` 算出来，改为内部计算 | 同上 | 源码约 −2，另外 6 处测试调用变短 | 低 |
| 18 | 零碎：`river.ts:68`（`getState`）、`:77`（`useBootstrap`）没有调用方；`river.ts:201` 的 `GUIDED` 取值被 `runner.start:138-144` 完全忽略（主进程写死了教学桌配置）；`mastra.ts:26` 的 `Runtime.mastra` 字段从未读取（`new Mastra()` 构造本身保留） | 删除，或只传 `{ ...lobby, guided: true }` | — | 约 −6 | 低 |

合计约 −520 行，其中 #1 约占 320 行。

## 建议本轮做（低风险、高收益）

1. #1 删除未用的 shadcn 组件和 TooltipProvider（约 −320）。
2. #3 breaker 只留一条通道（约 −12）。
3. #2 requestId 改由 renderer 生成，删掉 `early` 暂存（约 −30）。
4. #6 格式化函数集中到 `shared/format.ts`，#10 `Legal`/`Profile` 只保留一份（合计约 −16）。
5. #7 `HandSummary` 带上 vpip/pfr，去掉 Stats 的 N+1。
6. #8、#9 测试辅助去重（约 −38）。
7. #11、#12、#13、#15、#17、#18 这些小的合并与删除（合计约 −36）。

#4 与 #5 收益不错，但会改 IPC 契约或写入语义，建议各自单独提交，并跑完整测试后再合入。#16 需要迁移，可做可不做。

## 建议不动（附理由）

| 位置 | 理由 |
|------|------|
| `db/index.ts:45-73`：`withRetry`、BUSY 后重建 client、`setImmediate` 延迟关闭、`generation` | 对应 note T3 的 libsql 0.18 静默丢写，有实测（evidence/T3/r3-busy.md）和 `db.test.ts` 写锁用例覆盖。分支都是必要的，没有更短的正确写法 |
| `mastra.ts:44` 让 LibSQLStore 单独建 client | note T3：业务侧重建 client 会打断 Mastra 的事务 |
| `agents/queue.ts` 整体（durable、抢占、2 秒越过、`active`、`MAX_PENDING`） | 三个核心保证（同一 agent 串行、决策可以抢占闲聊、每手结果不丢）各自对应一条规则。`MAX_PENDING` 在连续点多手复盘时确实会触发（runner.test“复盘被队列拒绝”）；“越过 + active”用来防不响应 abort 的调用把某个对手的队列永久卡住；`idle()` 保证重置记忆时不会被写回。85 行、11 条用例，删掉任何一条都会丢掉一个保证 |
| `runner.ts:671-686` 中 `guarded` 的计时器与队列赛跑 | T4 结论：排队中的任务可能永远拿不到 abort 信号，只能靠赛跑脱身 |
| `agents/tools.ts:21-23` 的 `allow()` 角色校验 | note T4 明确要求信息隔离由代码保证，不能依赖 `activeTools` |
| `agents/views.ts` 与 `table/view.ts` 分成两个文件 | 两者分别是“给 agent 的唯一出口”和“给 renderer 的唯一出口”，各自承担信息隔离的职责，不宜合并（#17 只动参数） |
| `runner.ts` 中的 `deciding`、`pendingAI`、`heroKey`、`endKey`、`autoHand/autoDue` | 暂停/恢复、晚到结果丢弃、自动下一手等提问和赢家发言，这些行为都有对应的 runner.test 用例。这些字段是状态本身，不是重复。773 行拆成多个文件不会降低复杂度 |
| `src/main/spike.ts` 及 `index.ts:6,56` 的入口 | task.md:81/552 规定保留到 T9 验收、发布前删除。它的 `mockModel` 与 `test/mock-model.ts` 重复，但会随 T9 一起删掉，现在不值得去重 |
| `lastCall` / `agent:last`、`autopilotCount` | 设计稿里的“LLM 用量 / 托管次数”展示，Settings 页在用 |
| `filterSay` 的正则 | 原型规则加上截断后复查，`leak.test.ts` 覆盖 |
| `lib/hotkeys.ts` 的几条排除规则 | 每条都对应一个真实的双触发或误触发场景（IME、按钮上按空格、弹窗） |

## 顺带发现（非复杂度问题，未深究）

- `lib/river.ts:166` 的 `reloadSettings = updateSettings({})` 为了读回设置，会让主进程执行一次 `setKv('settings')` 写库。不影响正确性，但“读”触发了写。做 #5 时可以顺便让 `provider.delete` 和 `table.start` 直接返回 `Settings`，把 `reloadSettings` 删掉。
