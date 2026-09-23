# River 桌面版：方案讨论快照（第 3 轮，含审阅后修订）

本文件记录讨论收敛出的完整做法，供独立审阅与用户确认。未经批准前不是最终 plan。

## 1. 原始请求与用户决定

请求：导入 claude.ai/design 项目中的 `River.dc.html`（附 `poker.js`、`support.js`），基于 Rivo 工作流实现，使用 Mastra 和 shadcn。

用户在讨论中作出的决定：

| 问题 | 用户决定 |
| --- | --- |
| 形态 | 纯桌面端，倾向 Electron（Mastra 是 TS 库） |
| Mastra 用法 | 对手、教练都是独立智能体，有独立 agent loop、tool call、memory；“做就做完善” |
| Workflow | 用户认为与需求不太适配，委托 AI 决定 |
| 持久化 | Mastra storage 用 SQLite |
| 模型 | 提供方不能写死，用户自行配置；只有对手和教练需要模型 |
| Memory | 尽量拟人，委托 AI 定，列出的三项都可以记 |
| AI 超时 | 回退本地逻辑，并明确标记为自动判断（类似斗地主托管） |
| 公屏 | 全局聊天记录，对手、教练、玩家都能读；玩家可随时发言，不要求回复；对手看到也可随时回 |
| 公屏回应（第 2 轮） | 玩家和对手的发言都可能引起回应，限一层 |
| 话痨程度（第 2 轮） | 不要全局设置，靠人设 |
| 台词（第 2 轮） | 赢牌由 agent 说；托管时用预设台词 |
| 前提确认（第 2 轮） | 同意：引擎在主进程、目录 `~/Documents/AI/river`、首发 macOS arm64 |
| 限一层边界（第 3 轮后） | 只有玩家和对手的“主动发言”引起回应 |
| 方案批准（第 3 轮后） | 批准，并授权按流程一直做到实施 |
| 发言类型（plan 审阅后） | 发言工具加参数，由对手声明是自由发言还是接话 |
| 赢家发言（plan 审阅后） | 会引起回应，算一次主动发言（替代本稿 §5.2 中“不触发”的规则） |

AI 在委托范围内的选择：不使用 Workflow（ADR-002）；Memory 作用域与模板（见 §5）；把“靠人设”落实为角色级“健谈度”门槛（§5.2，已告知用户理由，可推翻）。

## 2. 范围

本期实现设计稿全部页面与交互：大厅、牌桌、AI 对手、手牌回放、数据统计、设置、规则引导与教学牌局，保留快捷键 F/C/R/N/空格、下注预设、硬核模式、自动下一手、收起公屏等细节。视觉按设计稿的浅色风格，用 shadcn/ui 组件承载。

相对设计稿的有意变化：

| 设计稿 | 本方案 | 原因 |
| --- | --- | --- |
| 设置“模型：Haiku/Sonnet” | 设置“模型提供方”与“对手模型”“教练模型”两项 | 用户决定提供方可配置 |
| 设置“LLM 用量 x/15” | 删除；改为显示最近一次调用的模型与耗时 | 预算是为 `window.claude` 限流而设；用户自带 key 后无此约束 |
| 公屏回复由单独一次调用扮演多角色 | 删除该调用；各对手 agent 自己决定是否回应 | 用户决定公屏只是共享记录 |
| 全局“话痨程度”（设置页与公屏标题栏） | 删除；角色新增“健谈度”，AI 对手页显示 | 用户决定靠人设 |
| 赢牌台词随机取预设 | 赢家 agent 闲聊调用发言；托管出牌仍用预设台词 | 用户决定 |
| 本地存储最近 60 手 | SQLite 保留全部手牌；统计图仍取最近 40 手 | 本地数据库无容量压力 |
| 不标注托管 | 超时或出错回退本地引擎时，座位状态与公屏行动标“托管” | 用户决定 |

不做：多人联机、账户与云同步、自动更新、代码签名、深色模式、Windows/Linux 安装包（代码不排斥，首发只验证 macOS arm64）。

## 3. 进程与模块结构

```
┌──────── Renderer（React + Tailwind + shadcn/ui）────────┐
│ 页面：大厅/牌桌/AI 对手/回放/统计/设置/引导               │
│ 只持有 UI 状态；牌局状态来自主进程推送的 TableView       │
└─────────────┬───────────────────────────────────────────┘
              │ preload 暴露 window.river（类型化 IPC）
              │ ↓ 命令：startTable/heroAct/nextHand/leave/rebuy/
              │        sendChat/askCoach/resume/reviewHand/settings…
              │ ↑ 事件：table:view、chat:append、coach:*、agent:status
┌─────────────▼──────── Main（Node, ESM）─────────────────┐
│ engine/poker.ts   原 poker.js 移植为 TS 纯函数           │
│ table/runner.ts   TableRunner：推进牌局、调度 agent、    │
│                   暂停/继续、超时托管、手牌结束落库      │
│ agents/opponent.ts  opponentAgent（按 persona 动态）      │
│ agents/coach.ts     coachAgent                           │
│ agents/tools/*      按身份裁剪视角的工具                  │
│ models/resolve.ts   requestContext → 用户配置的模型       │
│ db/                 LibSQLStore + river_* 表              │
└─────────────┬───────────────────────────────────────────┘
              ▼
   <userData>/river.db（mastra_* 表 + river_* 表，单文件）
```

TableRunner 是牌局的唯一写入者。Renderer 发来的命令都经它校验（例如非玩家回合的 heroAct 被拒绝），每次状态变化后向 Renderer 推送一份按玩家视角裁剪的 `TableView`（未摊牌的对手底牌不下发）。

## 4. 牌局主循环（TableRunner）

```
startHand ──► 轮到谁？
               ├─ 玩家：推送 view；若教练开启 → 并行跑 coach.proactive
               │        等待 heroAct（若被教练暂停，需 resume 后才接受）
               ├─ AI：  思考停顿（按速度设置）→ opponent.decide（带超时）
               │        ├ 成功：apply(action)，say 进公屏与气泡
               │        └ 超时/异常/非法：decide() 本地决策，标“托管”
               ├─ runout：每 900ms 发一张
               └─ 结束：结算 → 写 river_hands → 推送结果 → 自动下一手(4.5s)
```

规则：
- 每次推进前检查 `runId` 与 `hand/log 长度`，丢弃过期的异步结果（沿用原型做法）。
- 暂停：玩家提问或教练 pause 时置 `paused`。AI 已发起的决策结果先挂起，resume 后提交（沿用原型 `pendingAI`）。
- 超时：每次对手决策设 `abortSignal`，默认 10 秒，`maxSteps` 6。超时、抛错、未调用行动工具时都回退本地引擎并标“托管”。
- 玩家离桌：`runId++` 并中止所有进行中的 agent 调用，筹码退回余额（已投入底池的部分作废，与原型一致）。
- 退出应用（窗口关闭或 Cmd+Q）：按离桌处理后再退出。
- 熔断：只统计决策模式（对手）与主动判断/提问（教练）的失败：超时、抛错、对手未调用 `act`。闲聊调用的超时、被主动中止都不计入。同一角色类型在本桌连续失败 3 次后：对手全部托管、不再发起闲聊与赢家发言（改用预设台词）；教练停用。Renderer 显示横幅“模型连续失败，已托管 · 重试”，点击重试清零计数。

### 4.1 调用串行与意图提交

每个 agent 实例（每个 persona、教练）在 TableRunner 中有一个串行队列，同一实例同一时刻只有一个调用，避免 working memory 整份覆盖导致的丢失更新（`@mastra/memory` 的锁只串行写入，不防止读-改-写覆盖）。
- 对手：轮到它行动时，若其闲聊调用仍在进行，先中止该闲聊（`abortSignal`），**等待被中止的调用结束**（最多 2 秒，计入 10 秒决策超时；进行中的 `updateWorkingMemory` 会完成写入），再发起决策；超过 2 秒仍未结束则直接发起决策，旧调用的结果丢弃。该 persona 队列中尚未开始的闲聊任务（含赢家发言）在轮到它行动时一律丢弃，赢家发言被丢弃时改用预设台词。闲聊请求在决策进行中到达则直接丢弃。
- 超时判定依据 TableRunner 自己的计时器：被中止的 `generate` 会正常返回 `finishReason: 'aborted'` 而不抛错，不能靠捕获异常判断。
- 教练：玩家提问中止进行中的主动判断，同样等待其结束后再发起；复盘在队列中排队。被 TableRunner 或玩家主动中止的调用不计入熔断失败。
- 教练调用上限：主动判断 12 秒、`maxSteps` 4；提问 30 秒、`maxSteps` 6（流式）；复盘 45 秒、`maxSteps` 6。
- 每手结束写入对手 thread 的结果消息（见 §5.2）也作为一个无 LLM 的任务进入该 persona 的队列，保证消息顺序。

工具不直接修改牌局，只把意图写入本次调用的结果收集器：`act`、`say`、`hint`、`pause_game`。调用返回后，TableRunner 先检查 `runId`、手号、行动序号（教练另查 heroKey）是否仍有效，再按顺序应用：多个 `act`、`say` 各取第一个；教练同时有 `pause_game` 与 `hint` 时取第一个 `pause_game`，否则取第一个 `hint`；过期结果整体丢弃。`say` 同样在返回后统一写入公屏，行动与发言在公屏合并为一条（与原型一致）。

## 5. 智能体

### 5.1 共同约定

- 每个 agent 调用都携带 `requestContext`：`role`（opponent/coach）、`tableId`、`seatId`、`personaId`。工具从 context 取身份，只返回该身份可见的信息，由代码而不是提示词保证信息隔离。
- 模型通过 `model: ({ requestContext }) => resolveModel(role)` 解析为用户配置的 `{ id, url?, apiKey? }`。
- 行动和发言都通过工具完成，不依赖结构化输出，以兼容更多提供方（部分模型不能同时用工具和结构化输出）。决策模式设 `toolChoice: 'required'` 提高 `act` 调用率；教练主动判断用 `toolChoice: 'auto'`（不调工具即静默）。
- 各模式用 `activeTools` 限定工具，且都包含 Memory 注入的 `updateWorkingMemory`，否则该模式无法更新记忆：
  - 对手决策：`view_table, estimate_equity, read_chat, hand_history, say, act, updateWorkingMemory`
  - 对手闲聊：`read_chat, hand_history, say, updateWorkingMemory`
  - 教练主动：`view_hero, estimate_equity, read_chat, recent_hands, hint, pause_game, updateWorkingMemory`
  - 教练提问/复盘：`view_hero, estimate_equity, read_chat, recent_hands, updateWorkingMemory`
- 提供方拒绝 `toolChoice: 'required'` 时（测试连接会检测并记住），该提供方改用 `'auto'`，停止条件不变。

### 5.2 opponentAgent

一个 Agent 定义，instructions 为动态函数：基础规则 + 角色提示词（可在“AI 对手”页编辑，下一手生效）+ 健谈度描述 + 禁止泄牌。

工具：

| 工具 | 返回或作用 |
| --- | --- |
| `view_table` | 自己的底牌、公共牌、底池、需跟注、各玩家筹码与状态、本手行动 |
| `estimate_equity` | 对随机手牌的胜率、底池赔率、出路（本地计算） |
| `read_chat` | 公屏最近 N 条（含玩家与其他对手发言） |
| `hand_history(n)` | 自己在座的最近 n 手（n ≤ 10，可跨牌桌）的公开结果：摊牌亮出的牌、赢家与金额、自己的盈亏 |
| `say(text)` | 发言；代码过滤牌面点数/花色/“对子”等后写入公屏与气泡，超 40 字截断 |
| `act(action, to?)` | 终止工具：提交 fold/check/call/raise；非法动作按原型规则纠正 |

循环在调用了 `act` 的那一步结束后停止（`stopWhen` 自定义条件）。同一步内的并行工具调用会执行完，因此 instructions 要求：需要更新印象时，与 `act` 在同一步调用 `updateWorkingMemory`。

Memory：
- `resource = opponent:<personaId>`，working memory 作用域为 resource，跨牌桌保留。模板：对“你”（玩家）的印象（入池倾向、是否爱诈唬、被抓过的诈唬）、对其他角色的印象、当前心情（让情绪化角色真实上头）。
- `thread = table:<tableId>:<personaId>`，决策与闲聊共用，保留本桌上下文，`lastMessages` 取最近 20 条。
- 每手结束时，TableRunner 把该手的公开结果（摊牌亮出的牌、赢家、金额、自己的盈亏）作为一条消息写入每个在座对手的 thread（直接写 memory，不调用 LLM），让“被抓过的诈唬”“心情”有事实依据。

角色定义新增“健谈度”（0–1），与紧度、攻击性、诈唬并列，在 AI 对手页显示。初值：阿狸 0.6、老K 0.15、小白 0.85、教授 0.35、石头 0.05、阿May 0.5、牛仔 0.6、禅师 0.25。

公屏回应（限一层）。“一层”指：一句主动发言最多引出一轮回应调用，回应本身不再引出回应。按发言来源定义：

| 发言来源 | 是否触发回应 |
| --- | --- |
| 玩家在公屏输入 | 触发 |
| 对手决策模式中的 `say`（行动时顺带说的话，含顺带回应别人） | 触发 |
| 对手闲聊模式中的 `say`（回应调用的产物） | 不触发 |
| 赢家发言（一手结束时的闲聊调用） | 不触发 |
| 托管出牌的预设台词 | 不触发 |

- 每条可触发的发言，TableRunner 对其余在座、不在决策中、未熔断的对手按各自健谈度抽样，抽中者进入闲聊模式（`maxSteps` 3，超时 8 秒），由 agent 按人设决定说不说。同一对手 10 秒内最多一次由发言触发的闲聊调用。
- 一手结束时，赢家（非玩家）进入一次闲聊模式发言；不受 10 秒冷却限制；失败或熔断时改用预设“赢牌”台词。其 thread 中已有本手结果消息，输入只提示“你赢了这一手”。
- 托管出牌时，按原型规则随机取该角色预设台词。

### 5.3 coachAgent

instructions：人设（温和老师/直白教练/数据派）+ 讲解深度 + 只知道玩家可见信息。

工具：`view_hero`、`estimate_equity`、`read_chat`、`recent_hands(n)`（查 river_hands）、`hint(message)`、`pause_game(message)`。

三种调用：

| 场景 | 行为 |
| --- | --- |
| 主动（轮到玩家且教练开启） | 不调工具即静默；`hint` 显示提醒；`pause_game` 暂停牌局并显示提醒。教学牌局要求至少 hint。玩家已行动后返回的结果丢弃 |
| 提问 | 暂停牌局，流式输出回答到教练栏 |
| 复盘（回放页） | 读取该手记录，给出做得好/可改进/下次原则，结果存 river_reviews |

Memory：`resource = hero`，working memory 模板：玩家水平、常见漏洞、已讲过的概念、近期进步。`thread = coach:<tableId>`，每次入座一个；复盘使用 `thread = review:<handId>`。

## 6. 模型提供方配置

设置页新增“模型提供方”分组：
- 添加提供方：类型（Mastra 模型路由支持的厂商，或 OpenAI 兼容接口）、base URL（兼容接口必填）、API key、显示名称。
- 对手模型、教练模型：各选一个“提供方 + 模型 ID”，提供“测试连接”。
- API key 用 Electron `safeStorage` 加密后存入 river_providers，只在主进程解密，不下发 Renderer。

未配置时：对手使用本地引擎（设置中“决策引擎”自动为本地，座位不标托管，因为这是用户选择而非回退）；教练栏显示“配置模型后可用”，概率面板照常显示。

首次启动：规则引导最后一页之后增加“配置模型”页（可跳过）。未配置教练模型时点击“教学牌局/带我打一手”，先弹出配置提示，可选择“仍然开始（无教练讲解）”。

## 7. 数据

| 表 | 内容 |
| --- | --- |
| `mastra_*` | Mastra 自管：threads、messages、resources（working memory） |
| `river_settings` | 单行 JSON：设置、大厅选择、已看引导标记、余额 |
| `river_personas` | 角色提示词覆盖（personaId → prompt） |
| `river_hands` | 每手记录 JSON（结构同原型 `rec`）+ 手号、时间、牌桌 ID |
| `river_reviews` | handId → 复盘文本 |
| `river_providers` | 提供方配置，key 为密文 |

“清空记录”清除 river_hands、river_reviews，余额重置 100,000；不清除角色与教练记忆（设置中另提供“重置 AI 记忆”）。

## 8. 技术栈与工程

electron-vite（main/preload/renderer 三端，主进程 ESM）、React、Tailwind CSS v4、shadcn/ui、zod、`@mastra/core`、`@mastra/memory`、`@mastra/libsql`、vitest。打包用 electron-builder，`asarUnpack` 包含 libsql 原生模块。

## 9. 验证

- 引擎：移植后用固定牌例测试牌型比较、边池分配、单挑盲注、runout、非法动作纠正。
- TableRunner：用假 agent 测试超时托管、过期结果丢弃、暂停挂起与恢复、离桌中止、泄牌过滤。
- 工具隔离：断言对手工具不返回其他玩家底牌，教练工具只返回玩家底牌。
- 测试连接：一次带 `toolChoice: 'required'` 的工具调用，记录提供方是否支持。
- 真实联调：配置一个真实提供方，打完整一手 6 人桌，检查 memory 写入 SQLite、托管标记、教练三种场景。
- 打包：macOS arm64 构建能启动并读写 `river.db`。
- 并发：同一 persona 闲聊进行中轮到其行动，闲聊被中止且 working memory 不被覆盖；教练晚到的 pause 被丢弃。

首个实施任务是技术验证：从设计项目重新拉取 `poker.js` 原文件存入 `design-source/`；在 Electron 主进程中跑通 LibSQLStore + 一个带工具的 Agent + 动态模型解析 + `safeStorage` 加解密（含重新构建后的读取），并完成打包启动。失败则回到本讨论调整（例如改用独立 Node 子进程承载 Mastra；届时需重新核对单进程串行队列的前提）。

## 10. 风险

| 风险 | 影响 | 处理 |
| --- | --- | --- |
| 公屏回应放大调用量 | 热闹角色多的桌上调用激增 | 健谈度门槛、限一层、单角色 10 秒冷却 |
| 部分提供方不支持 `required` | 开桌即频繁托管 | 测试连接检测并降级为 `auto` |
| 未签名应用的 safeStorage | 重新构建后 key 读不出 | 首个验证任务覆盖；失败则提示重新输入 key |
| agent loop 多步导致等待长 | 6 人桌一圈可能数十秒 | maxSteps 6、10 秒超时托管、思考速度设置只影响本地停顿 |
| 小模型不稳定调用 `act` | 频繁托管 | 托管率在设置页显示；提示换模型 |
| libsql 原生模块打包 | 应用无法启动 | 首个验证任务覆盖 |
| working memory 被模型写乱 | 角色印象失真 | 提供“重置 AI 记忆” |
