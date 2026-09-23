# 方案审阅 3：River 桌面版技术方案（第 3 轮）

## 本轮对象与版本

| 项 | 版本 / 位置 |
| --- | --- |
| 方案 | `plan.md`（第 3 轮快照，591 行，状态“待审阅第 3 轮”） |
| 用户决定 | `discussion.md` §1（第 20–30 行，含“发言类型”“赢家发言”两条补充决定） |
| 前轮 | `reviews/plan-2.md`（结论“需修改”：N1 阻塞，N2–N6 低） |
| 工程证据 | `mastra-probe`：`@mastra/core` 1.69.0、`@mastra/memory` 1.31.0、`@mastra/libsql` 1.23.1 的 dist 源码与类型 |

## 结论：需修改（一处，改动很小；改完可直接进入实施）

前轮 N1–N6 都已处理或已降为可在实施中补定的细节。N1 的修订（ask 进行中跳过 proactive、`resume` 不中止 ask、自动下一手等 ask 结束）与全文一致，没有引入新的矛盾。`listThreads({ filter: { resourceId }, perPage: false })` 的写法与源码一致。

需要修改的是一个新发现，性质与 N1 相同，但前两轮都没有看到：**复盘任务和 proactive、ask 共用教练队列，会被它们抢占中止或丢弃**（M1）。最常见的操作路径就会触发：打完一手后去回放页看复盘。

```
教练队列（单一 AgentQueue）上的三类任务
                    ┌──────────── 会被谁中止 / 丢弃 ─────────────┐
  proactive ◄─────── 新的 proactive、ask                      已写明
  ask       ◄─────── 新的 ask（proactive 遇 ask 则跳过）         已写明（N1 修订）
  review    ◄─────── proactive、ask（preempt 不区分任务类型）   未写明  ← M1
```

## 前轮问题处理情况

| 前轮 | 处理 | 依据（plan 行号） | 评价 |
| --- | --- | --- | --- |
| N1 proactive 抢占 ask | proactive 的触发条件加上“没有进行中的 ask”；proactive 只抢占上一次 proactive，“从不抢占 ask（有 ask 进行中则本次跳过）”；ask 抢占 proactive 与上一次 ask；`resume` 时“进行中的 ask 继续输出，不被中止”；自动下一手要求“没有进行中的 ask”，并在“ask 结束后若条件满足再计时 4.5 秒” | 177、179、182、335、336 | 已处理。前轮给出的两种做法都用上了。与其他段落的关系见下文“一致性核对” |
| N2 “固定发言”转译为 `reply` | 第 25 行写“自由发言”还是“接话”；263–264 行写明 chat 模式按 `reply` 处理、win 模式按 `free` 处理 | 25、263、264 | 不阻塞。汇报时仍建议点明这个映射 |
| N3 win 失败与本地引擎 | win 失败不计入熔断；选择本地引擎时“不发起任何对手 LLM 调用，闲聊不发生，赢家发言与行动台词取预设台词” | 190、428 | 已处理 |
| N4 重置记忆与 Memory storage | `perPage: false`；占位 `threadId: 'reset'` 并说明原因；先等所有 AgentQueue 清空；代码块补上 `storage` | 289、495 | 已处理。接口形态经源码核实（见“已核实成立”） |
| N5 `reply_to` 与超时 | `reply_to` 不是本桌已有消息 id 时丢弃该字段；超时或失败转托管时丢弃已收集的 `say`，改用预设台词 | 279 | 已处理。chat 模式没有要求带 `reply_to`，只影响展示，不阻塞 |
| N6 P7 残留 | `lastMessages` 理由写在 291 行；`api_key_enc` 改为可空（406、462）；本桌托管次数由 `TableView.autopilotCount` 提供（540）；`coach:thread` 事件改为 `app.bootstrap.coachThread`（505） | 291、406、462、505、540 | 主要项已处理。以下仍未写，都不阻塞：删除一个仍被 `settings.models` 引用的提供方怎么办；`table.setChatShown` 为何要发到主进程；教学牌局是否强制 `coachOn`、`level: 'novice'` 并给出开场提醒；Renderer 重载后公屏记录怎么恢复（见 L2） |

## 一致性核对（N1 修订与全文）

| 核对点 | 结论 |
| --- | --- |
| ask 进行中跳过 proactive，与教学牌局“每一步至少 hint”（335 行） | 不冲突，但有例外。牌局进行中提问会暂停牌局（177 行），玩家暂停期间不会轮到行动，所以只有两种情况会跳过：玩家在回答输出期间点了“继续”，或者一手结束后提问、随后手动点了下一手。这两种情况下玩家都刚得到教练回答，缺这一步的 hint 可以接受。“每一步至少 hint”本来就是给模型的输入要求，proactive 失败也不提示（335 行），系统从不保证每一步都有 hint。建议在 335 行补半句“教学牌局接受这一步没有 hint”，免得执行者去补一个 ask 结束后重新触发 proactive 的逻辑。不阻塞 |
| 自动下一手等待 ask，与离桌 | 一致。离桌时 `runId++` 并中止所有 agent 调用（180 行），ask 随之结束；自动下一手要求“仍在同一 `runId`”（182 行），所以不会误发 |
| 自动下一手等待 ask，与熔断 | 一致。ask 最长 30 秒（229 行），失败会计入熔断并结束，之后照常计时；熔断后不再发起新的 ask（193 行） |
| 自动下一手等待 ask，与暂停 | 一致。牌局中提问已经把 `paused` 置为真，“未暂停”这一条件已经挡住了自动下一手；“没有进行中的 ask”只在一手结束后提问（不暂停）时额外起作用，正是前轮 N1 的场景 1 |
| `resume` 不中止 ask，与 177 行 | 一致。177 行中止的是 proactive，不是 ask |
| 熔断计数 | 190 行“被主动中止的调用不计入”，覆盖 ask 被新 ask 抢占、proactive 被 ask 中止两种情况 |
| `listThreads` 参数形态 | 与源码一致，见“已核实成立” |

## 新发现

### M1【中，阻塞】复盘任务会被 proactive 和 ask 中止或丢弃

**位置**：241 行（`preempt=true` 中止当前任务，并丢弃排队中未开始的可丢弃任务，不区分任务类型）；252 行（复盘在教练队列中排队）；335–337 行；546 行（有桌时可以切到其他页面）。

**证据**：

- 教练只有一个 `AgentQueue`（236 行）。proactive 和 ask 都以 `preempt: true` 提交。N1 的修订只写了“proactive 不抢占 ask”，没有写 review。按 241 行的接口照写，队列里正在运行的 review 会被中止，排队中的 review 会被当作可丢弃任务直接丢掉。
- 最常见的路径就会触发：一手结束，4.5 秒后自动发下一手（182 行）；玩家这时切到回放页，点“让教练复盘这一手”。TableRunner 在主进程里继续运行，与 Renderer 当前在哪个页面无关，几秒后就会轮到玩家，于是触发 proactive（335 行），抢占并中止最长 45 秒的 review。玩家在回放页看到“复盘失败，稍后再试”（337 行）。
- 排队中的 review 被 ask 或 proactive 丢弃时，337 行只规定了“失败时推送 `review:done` 带 `error`”，没有规定“被丢弃”时推送什么。按现在的写法，页面会一直停在加载状态。

**后果**：牌桌开着的时候，复盘经常失败，或者没有任何结果。执行者只能自己决定 review 能不能被抢占。

**建议**（二选一，写进 335–337 行和场景表）：

- proactive 遇到进行中的 review 时也跳过（与 ask 同样处理）。ask 遇到 review 时，可以抢占（玩家主动操作，review 失败后可重试），也可以排在 review 之后。
- 或者：把 review 标为不可被 proactive 抢占的任务。

另外写明：review 无论被中止还是被丢弃，都推送 `review:done { error }`。

同时建议把“哪些任务可被抢占”放进 `AgentQueue` 的接口（例如在提交任务时标明任务类型，并声明本次抢占可以中止哪些类型），不要依赖调用方先查“有没有进行中的 ask”。现在 N1 靠调用方检查，M1 如果也这样处理，就是两处散落的特判。这一点是写法建议，不阻塞。

### L1【低】被抢占的 ask 显示什么，仍然没有定义

前轮 N1 建议写明“被抢占的 ask 推送 `coach:done { ok: false, error: 'aborted' }`，Renderer 怎么显示”，本轮没有写。按 336 行，失败统一显示“教练暂时没连上，稍后再问”。但玩家连着问两个问题时，第一个回答被中止后也会显示这句话，与实际原因不符。建议区分 `aborted`：保留已经输出的部分，标“已中断”。不阻塞。

### L2【低】Renderer 重载后公屏为空

`app.bootstrap` 只恢复了教练对话（505 行）。`TableView` 里没有公屏记录（540 行），公屏只通过 `chat:append` 增量推送。所以 Renderer 重载后公屏是空的。建议在 bootstrap 中一并返回 `chat`。另外，505 行在表格行的末尾追加了括号说明，会破坏 Markdown 表格，建议挪到表格下方。都不阻塞。

## 已核实成立

| 核对项 | 结论 | 依据 |
| --- | --- | --- |
| `listThreads({ filter: { resourceId }, perPage: false })` | 参数形态正确：`filter.resourceId?: string`，`perPage?: number \| false`，默认 100。`Memory.listThreads` 直接转交给存储层。libsql 实现按 `resourceId = ?` 过滤；`perPage: false` 时要求 `page` 为 0（默认值就是 0），并归一化为 `Number.MAX_SAFE_INTEGER` | `core/dist/storage/types.d.ts` 第 177–202 行；`memory/dist/src-zTE4189S.js` 第 31388–31390 行；`libsql/dist/index.js` 第 8596–8630 行；`core/dist/storage-ZGws_ZtK.js` 第 7061–7069 行；`core/dist/filesystem-versioned-D0CrOfVk.js` 第 178–186 行 |
| `deleteThread(threadId)`、`updateWorkingMemory({ threadId, resourceId, workingMemory })` 签名 | 与 plan 495 行的用法一致 | `memory/dist/index.d.ts` 第 154、173、198 行 |
| 重置记忆时删除 `review:<handId>` thread | 这些 thread 属于 resource `hero`，会被一并删除；复盘文本另存在 `river_reviews`，不受影响 | plan 339、453–456 行 |
| 版本 | core 1.69.0、memory 1.31.0、libsql 1.23.1 | 各包 `package.json` |

## 检查限制

- 本轮只读了 plan 文字和 Mastra 源码，没有运行代码。M1 的时序是根据 plan 的文字推断的：TableRunner 与 Renderer 当前在哪个页面无关，而 plan 也没有写离开牌桌页时暂停牌局。如果实际打算在离开牌桌页时暂停牌局，M1 的主路径会弱化，但 ask 丢弃排队 review 的问题仍在。
- 没有重新核对 `discussion.md` §1 以外的历史讨论，也没有读 `poker.js` 原文和设计稿。
- 前轮已核实的接口（`PROVIDER_REGISTRY`、Memory storage 等）本轮没有重复验证。
