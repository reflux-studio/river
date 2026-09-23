# 方案审阅 2：River 桌面版技术方案（第 2 轮）

## 本轮对象与版本

| 项 | 版本 / 位置 |
| --- | --- |
| 方案 | `plan.md`（第 2 轮快照，2026-09-24，589 行，状态“待审阅第 2 轮”） |
| 需求与用户决定 | `discussion.md` §1（含 plan 审阅后新增两条：第 27 行“发言类型”、第 28 行“赢家发言”） |
| 调查与决定 | `note.md`；`adr/001`~`003` |
| 设计稿 | `design-source/River.dc.html` |
| 工程证据 | `mastra-probe`：`@mastra/core` 1.69.0、`@mastra/memory` 1.31.0、`@mastra/libsql` 1.23.1 的 dist 源码与类型；本轮在该目录用 node 直接读取 `PROVIDER_REGISTRY` |
| 前轮 | `reviews/plan-1.md`（结论“需修改”，P1–P8） |

## 结论：需修改（仅一处规则需补写，改完可直接进入实施，无需再做一轮全面审阅）

前轮 P1–P6 都有了实质处理，P8 已在 `discussion.md` §1 补记。新增的 `say.kind`、`mode: 'win'`、durable 任务、显式 storage、重置记忆流程与 Mastra 1.x 的真实接口对得上（见“已核实成立”）。

唯一需要改的是 N1：教练的主动判断会用抢占打断正在流式输出的提问回答。前轮 P6 已经提出过这个问题，本轮只处理了一半。这是一个会实际发生的遗漏后果，而且执行者按现在的 `AgentQueue` 接口照写，就会把回答截断。

另外，用户原话是“自由发言还是**固定发言**”，plan 把它落实为 `free | reply`（接话）。这个解读说得通，但它是 AI 做的转译，建议在向用户汇报时点明这个映射（N2）。这一项不阻塞。

```
本轮发现在业务流程中的位置
 入座 ──► 对手决策 ──────► 公屏发言 ─────────► 手牌结束 ──────────► 离桌 / 设置
          │                │ N2 “固定发言”的转译 │ N1 下一手的 proactive │ N4 重置记忆的细节
          │                │ N5 kind/reply_to    │    抢占教练的回答     │ N6 前轮 P7 残留
          │                │    的边界情况       │ N3 win 失败是否计入   │
          │                │                     │    熔断               │
```

## 前轮问题处理情况

| 前轮 | 处理 | 依据（plan 行号） | 评价 |
| --- | --- | --- | --- |
| P1 主动发言靠模型自报 `reply_to` | 改为 `say` 必填 `kind: 'free' \| 'reply'`；decide 模式的 instructions 要求声明 `kind`，并要求先 `read_chat`；chat 模式按 `reply` 处理，win 模式按 `free` 处理；triggers 表按“模式 + kind”逐行判定；`reply_to` 只用于展示 | 25、262–264、276、364–374 | 已处理，也与用户的新决定一致。模型自报的局限依然存在（模型把接话标成 `free` 时仍会引出一轮回应），但这是用户亲自选择的做法，不算缺陷。旧的“没带 `reply_to` 就算主动发言”的语义在全文中已无残留 |
| P1 赢家发言 | 用户决定“算一次主动发言”；新增 `mode: 'win'`；分池时只取赢得最多的一位；不受冷却限制；失败、熔断或被丢弃时使用预设台词，且 `triggers = false` | 26、207、227、372、391 | 已处理 |
| P2 结果消息被抢占丢弃 | `task.durable`：抢占和队列满时都保留，并先于抢占任务执行；场景表同步 | 243、253 | 已处理，与“赢家发言依赖本手结果已写入”（391 行）的顺序一致 |
| P3 删除 resource 的 API 不存在 | 离桌时对每个 resource 执行 `listThreads` → `deleteThread`，再用 `updateWorkingMemory` 写回模板 | 492 | 方向正确，签名基本对得上；有两个实施细节需要补上（见 N4） |
| P4 Memory 没有 storage | 文字写明两个 Memory 显式传入同一个 `storage` | 200 | 已处理。但 286–291 行的代码块仍然是 `new Memory({ options })`，没有写 `storage`，与文字不一致（见 N4） |
| P5 内置提供方填 baseUrl 会切换协议 | 只有 `openai-compatible` 才有 baseUrl 字段，而且必填 | 402、414–416 | 已处理 |
| P6 教练规则 | 已补：失败时的显示（`coach:done.error`、`review:done.error`，失败不落库）、`requestId`、proactive 抢占上一次 proactive | 333–334、514、528–531 | 部分处理。“教练正在回答提问时，主动判断怎么办”没有写（见 N1） |
| P7 契约缺口 | 已补：`agent:last`、`coach:thread`、`HandSummary`、`Lobby`、`Provider`、`Persona`、`safeStorage` 解密失败 | 422、515、530–536 | 部分处理，其余项见 N6 |
| P8 讨论记录未同步 | `discussion.md` §1 第 27、28 行已补记，并注明替代 §5.2 | discussion 27–28 | 已处理。§5.2 第 152 行的“含顺带回应别人也触发”仍留在原文里，但 §1 已注明以新规则为准，可以接受 |

## 新发现

### N1【中，阻塞】下一手的主动判断会抢占并截断正在输出的提问回答

**位置**：第 240–241 行（`preempt=true` 会中止**当前任务**，不区分任务类型）；第 251 行；第 333 行（proactive“抢占上一次未结束的 proactive”）；第 177、182 行。

**证据**：

- 教练只有一个队列。proactive 如果按 `preempt: true` 提交，被中止的是队列里正在运行的任务，而这个任务可能是 ask。第 333 行的意思是“只抢占 proactive”，但 `AgentQueue.run(task, { preempt })` 没有“只抢占同类任务”的语义。场景表（247–253 行）也没有 proactive 这一行。
- 这种情况在正常操作中就会出现，不需要什么极端时序：
  1. 一手结束后，玩家问“这手我打得怎么样”。这时牌局已经结束，第 177 行规定不暂停。第 182 行规定，只要没有暂停，4.5 秒后就自动发下一手。一旦轮到玩家，proactive 就会抢占这个最长 30 秒的流式回答。
  2. 玩家提问后，在回答还没输出完时点了“继续”（`resume`）。牌局恢复运行，很快轮到玩家，结果同上。

**后果**：回答被截断，Renderer 收到 `coach:done`（这时 `ok` 的取值也没有定义）。如果 proactive 改用排队，又会因为 `heroKey` 已经变了而被整体丢弃，教学牌局“每一步至少 hint”就会失效。执行者只能自己选一种做法。

**建议**（二选一，写进场景表）：

- 教练正在运行 ask 时，本次 proactive 直接跳过（前轮的建议）。教学牌局接受这一步没有 hint。
- 或者：只要 ask 还在进行，就不自动发下一手（把 ask 视为暂停），`resume` 等回答结束后才生效。

同时写明：被抢占的 ask 推送 `coach:done { ok: false, error: 'aborted' }`，Renderer 怎么显示。

### N2【低，不阻塞，汇报时点明】用户原话“固定发言”被转译为“接话（reply）”

**位置**：`discussion.md` 第 27 行；plan 第 25、262、276 行。

用户原话是“tool call 加一个参数呗，是自由发言还是固定发言”。plan 落实为 `kind: 'free' | 'reply'`，并用“接话”代替“固定发言”。从上下文看，这是在回应前轮 P1（主动发言和顺带接话怎么区分），所以“固定发言 = 回应别人的话”是最合理的解读。不过“固定发言”字面上也可以理解为“行动时顺带说的话”（相对于随时的自由闲聊）。按这种理解，decide 模式的发言会全部不触发回应，与现在的判定表不同。

**建议**：向用户汇报时用一句话说明映射：“自由发言 = `free`，会引起回应；固定发言按‘接话 / 回应别人’理解 = `reply`，不引起回应”。用户如果有异议，只需要改 triggers 表中的两行。

同时建议写进 plan：chat 和 win 模式下 `kind` 仍然必填，但会被忽略（263–264 行已隐含这一点）。`say` 工具的描述要按 mode 给出对应说明，免得模型困惑。

### N3【低】win 模式的失败是否计入熔断，以及本地引擎下是否还调用 LLM，都没有写

- 第 190 行规定“闲聊失败不计入”。但 win 已经是独立的 mode，它的失败是否计入，没有写。建议写明不计入，与闲聊一致。
- 前轮 P7 提到的“用户已配置对手模型、但决策引擎选了‘本地’时，闲聊和赢家发言是否还调用 LLM”，本轮仍未写（425 行只写了“未配置”的情况）。

### N4【低】重置 AI 记忆与 Memory 构造的实施细节

根据真实签名（见“已核实成立”），有以下几点需要补上：

- `listThreads` 默认每页 100 条（`StorageListThreadsInput.perPage` 默认 100）。对手的 thread 每开一桌就多一个，所以要写明 `perPage: false`，否则超过 100 桌后会删不干净。
- `updateWorkingMemory` 的 TS 类型里 `threadId: string` 是必填的。在 resource 作用域下，实现不使用这个值（`src-zTE4189S.js` 第 31501–31512 行），`updateResource` 在 resource 不存在时会新建（libsql 第 8466–8476 行）。建议写明“传任意占位 threadId”，免得执行者误以为要先建一个 thread。
- 离桌后，各对手队列中的 durable 结果消息任务不会被中止（第 180 行只中止 agent 调用）。如果离桌后立刻“重置 AI 记忆”，这些任务可能在 thread 被删之后执行 `createThread` / `saveMessages`，把本桌的 thread 重新建出来。建议写明：重置前先等各队列排空。
- 286–291 行的代码块要补上 `storage`，与第 200 行保持一致。

### N5【低】`kind` 与 `reply_to` 的边界情况

- `reply_to` 指向不存在的消息时，写入 `replyTo` 前要校验并丢弃无效 id（这个字段只用于展示，但 Renderer 会按它渲染引用）。
- chat 模式的 instructions（第 263 行）没有要求带 `reply_to`，所以回应消息大多没有 `replyTo`，与 decide 模式下 `reply` 的展示不一致。这只影响展示。
- 决策超时转为托管时，已经收集到的 `say` 意图是丢弃还是改用预设台词，没有写（188 行只说“随机取预设台词”）。建议写明丢弃。

### N6【低】前轮 P7 的残留

以下各项本轮没有处理，都不影响方案成立，执行时自行补定即可：

- `lastMessages` 仍为 40（讨论稿为 20），没有给出理由。
- `api_key_enc BLOB NOT NULL` 会挡住不需要 key 的 `openai-compatible` 接口（如 Ollama）。删除一个正被 `settings.models` 引用的提供方时怎么处理，也没有写。
- `provider.test` 测的是还没保存的 `{ providerId, modelId }`，而 `resolveModel` 只读 `settings.models[role]`，测试走哪条解析路径没有写。
- `table.setChatShown` 为什么要发到主进程，没有说明。
- 教学牌局强制 `coachOn: true`、`level: 'novice'`，并给出开场提醒（设计稿第 410–411 行），plan 没有提到。
- 设置页要显示“本桌托管次数”（第 36 行），但 `agent:last` 和 `TableView` 中都没有这个数据。
- `coach:thread` 规定在入座时推送。可是 thread 是 `coach:<tableId>`，每次入座都是新的，推送的内容总是空的。它真正的用途应该是 Renderer 重载后恢复教练对话，公屏记录同样需要恢复，建议改为在 `app.bootstrap` 有桌时返回。
- 旧版本遇到比自己新的 `user_version` 时怎么处理（不报错、不降级），没有写。

## 已核实成立

| 核对项 | 结论 | 依据 |
| --- | --- | --- |
| `listThreads` | `listThreads(args: StorageListThreadsInput)`，其中 `filter.resourceId` 可用，`perPage` 默认 100，可以传 `false` | `memory/dist/index.d.ts` 第 154 行；`core/dist/storage/types.d.ts` 第 177–202 行 |
| `deleteThread` | `deleteThread(threadId: string)`，会连同消息与 thread 作用域的 working memory 一起删除 | `memory/dist/index.d.ts` 第 173 行；`src-zTE4189S.js` 第 31429–31443 行 |
| `updateWorkingMemory` | `{ threadId: string; resourceId?; workingMemory: string; ... }`。resource 作用域下调用 `updateResource`，不使用 threadId；resource 不存在时新建 | `memory/dist/index.d.ts` 第 198–204 行；`src-zTE4189S.js` 第 31493–31535 行；`libsql/dist/index.js` 第 8466–8476 行 |
| 工具名 `updateWorkingMemory` | 默认的线上工具名就是这个 | `src-zTE4189S.js` 第 23316 行 |
| Memory 显式 storage | `MemoryConstructorConfig.storage?: MastraCompositeStore`，`LibSQLStore extends MastraCompositeStore` | `core/dist/memory/types.d.ts` 第 1073 行；`libsql/dist/storage/index.d.ts` 第 142 行 |
| `PROVIDER_REGISTRY` 的导出路径 | 从 `@mastra/core/llm` 导出（`llm/index.d.ts` 第 40 行），类型为 `Record<Provider, ProviderConfig>`。本轮实测共 208 项，每项有 `name`、`models`、`apiKeyEnvVar`、`docUrl`、`gateway`、`npm`，没有 `url` 字段。207 项的 gateway 为 `models.dev`，1 项为 `netlify`。下拉列表可以直接使用 | node 直接 import |
| durable 与熔断、win 模式 | 熔断时 win 改用预设台词（192、391 行）；被抢占丢弃时同样改用预设台词（249 行）；durable 先于抢占任务执行（243 行），保证 win 调用之前本手结果已经写入 | plan 对应行 |
| 回应不再引起回应 | chat 模式一律不触发，不看 `kind`（371 行），保证只有一层 | plan 对应行 |

## 检查限制

- 没有在 Electron 主进程或打包产物中运行 Mastra，也没有调用真实提供方。本轮只读了源码和类型，没有新写实验脚本。
- 模型对 `kind` 的实际标注准确率无法事先验证，只能在真实联调中观察。
- N1 的时序是按 plan 的文字推断的，没有运行代码验证。
- 仍然没有读到 `poker.js` 原文。
- 注册表中那 1 项 `netlify` gateway 能否用 `${kind}/${modelId}` 直接路由，没有核实。
