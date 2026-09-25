# task 审阅 · 第 1 轮

- 被审版本：`.rivo/issues/unified-agent/task.md` 工作区快照（基线 `main@3ba346c` + 未提交改动）
- 对照材料：`plan.md`、`discussion.md`、`adr/006-unified-table-agent-context.md`；代码 `src/main/agents/*`、`src/main/table/*`、`src/main/engine/eval.ts`、`src/main/models/prices.ts`、`src/main/index.ts`、`src/renderer/src/components/table/{ActionBar,CoachPanel}.tsx`、`TopBar.tsx`、`pages/Stats.tsx`、`lib/hotkeys.ts`、`index.css`；测试 `test/{table-helpers,mock-model,agents.test,runner.test,engine.test}.ts`
- 结论：**需修改**（阻塞 0，重要 5，建议 5）

总体：plan 的功能点 1–8、写入契约、压缩即中止、信息隔离、Purpose 三处改动、知识文档都有任务承接；依赖顺序（T1/T2 → T3 → T4，T5/T6 独立，T7 收尾）可行；公共接口与 plan 一致，没有为拆分改变获批设计。以下问题主要是缺少执行信息、会让实施者在测试或行为上走偏。

## 发现

### T-1（重要）T1 改 `outs` 口径会让现有「与原型对照」测试必然失败，task 未说明如何处理

- 证据：`test/engine.test.ts:393-400` 对 2000 组随机牌断言 `expect(outs(hole, board)).toBe(P.outs(hole, board))`，P 是原型 `design-source/poker.js`。T1 改口径后二者必然不一致。T1 的验证只写「7 个例子放进 engine.test.ts」，修改位置里没提这条对照测试。
- 后果：T1 检查命令必失败；实施者可能去改原型文件或放宽口径来「修」测试。
- 建议：在 T1 写明从该对照测试中移除 `outs` 断言（handName / disp / equity 对照保留），改由 7 个口径例子覆盖。

### T-2（重要）对手摘要的「行动」行会把玩家写成「你」，与对手自己的「你」混淆

- 证据：`runner.ts:112` 玩家座位 `name: '你'`；`handRecord` 把 `seats[e.seat].name` 写进 `rec.log[].name`；`heroHandSummary` 直接用 `x.name`。T3 步骤 4 要求 `opponentSummary` 的行动「按 heroHandSummary 的格式，名字只用公开名」，只对「位置」明确了玩家写作「玩家」。
- 后果：对手往手回顾里「你 加注至 300」实际是玩家的动作，而同一段 `publicHandResult` 里「你」指对手自己——对手会把玩家的行动当成自己的，直接破坏本期要解决的打法连贯性。现有单测不会发现。
- 建议：明确行动行按 `seat` 映射：座位 0 →「玩家」，该对手自己 →「你」，其他 → 公开名（与 `publicHandResult` 的 `name()` 规则一致）；在 T3 验证里加一条断言。

### T-3（重要）`chatSeen` 在调用前推进，失败/重试会丢失公屏

- 证据：T3 步骤 3「调用前执行 `thread.chatSeen = 最后一条消息 id`」。调用失败时 runner 进入 `stalled`，重试走同一 `opponentTurn`；此时 chatSeen 已推进，重试的观察里不再含这批公屏；而失败调用按契约不写入 thread，模型实际从未看到它们。结果过期丢弃（`handLog` 变化）也同理。
- 后果：违背 plan「chat 是该对手上一次被调用之后的新公屏」的本意（被看到过的才算），对手会漏掉他人的发言与赛后发言。
- 建议：先算出 `lastId`，只在 `pushTool` 返回 true 后再赋 `thread.chatSeen = lastId`。另外写明 `chatSeen` 为 null 或已被 `MAX_CHAT` 截掉找不到时的取法（例如取最近 8 条）。

### T-4（重要）T3 验证漏掉 plan 列出的「写下一手 summary 触发压缩时中止在途发言」

- 证据：plan「验证与发布 / 赛后发言」第 2 条：「runner 写下一手 summary 触发压缩时，在途的发言被中止」。T3 验证只有「该对手在新一手里第一次被调用时…中止」；T2 只测 `setSummary` 的 `onCompress` 回调参数，不涉及 runner 的 `talkCtrl`。
- 后果：`onHandEnd` 里 `setSummary(..., () => abortTalk(pid))` 这条接线可以写错（如漏传回调）而全部测试通过。典型场景：对手在第 N+1 手是大盲、全员弃牌到它，从未被调用。
- 建议：T3 验证补这一条（第 N 手 talk 挂起 → 第 N+1 手该对手未被调用即结束 → talk 被中止、返回结果不写入）。

### T-5（重要）T5 草稿同步规则在「提交后 raiseTo 不变」时失效

- 证据：T5 规定草稿只在 `raiseTo` 变化时同步为 `fmt(raiseTo)`；非法输入「回退到 raiseTo」、超出全下夹到 `maxTo` 时，如果原值已经是 `maxTo`，`setRaiseTo` 的值不变，React 不会触发同步。`ActionBar.tsx` 现有 effect 也只在 `isTurn` 等依赖变化时重置。
- 后果：输入 `abc` 回车后框里仍显示 `abc`；已在全下时输入 `99999` 仍显示 `99999`，与实际加注额不一致。
- 建议：回车/失焦确认时总是 `setDraft(fmt(结果))`，不依赖 `raiseTo` 变化；Esc 同理（已写）。

### T-6（建议）现有信息隔离测试需要按新输入迁移，task 未点名

- 证据：`runner.test.ts:287-339` 的 `spyOpponent` 读取 `i.situation`，并断言含「本桌最近几手」、用 `split('本桌最近几手')[0]` 排除往手文本。T3 之后没有 `situation` 字段也没有这段文字。
- 后果：实施者可能删掉测试而不是迁移；新测试如果检查全部 messages 而不排除「【往手回顾】」，往手摊牌亮出的牌可能恰是本手他人底牌，产生误报。
- 建议：T3 写明把这两条测试迁到 `messages`（含 tool-call input 与 tool-result），第一条「不含他人本手底牌」只检查当前观察，第二条改断言往手回顾存在且不含 `holeAfter`。

### T-7（建议）mock 模型不记录消息内容，T2/T4 的 prompt 断言无从实现

- 证据：`test/mock-model.ts` 的 `calls` 只记 `messages` 条数。T2 要求「mock 模型收到的 prompt 里有 tool-call 和 tool-result」；T4「复盘之后提问…调用本身不带工具」在 runner 替身层也看不到工具注册。
- 建议：修改位置加入 `test/mock-model.ts`（记录非 system 的 prompt 内容）；T4 的「不带工具」断言放在 agents.test 用 mock 模型做。

### T-8（建议）T7 的回退方案与「只改 thread.ts」不自洽

- 证据：「只把本次注册的工具渲染成 tool-call」需要 `messagesFor` 知道本次注册的工具名，现接口没有这个参数，必然要改 runner 的调用处。
- 建议：写成「给 `messagesFor` 加可选参数 `tool?: string`，runner 各调用处传入；写入契约不变」。

### T-9（建议）面板与文案细节偏离讨论决定

- ProbPanel 的统计项写作「所需胜率」，discussion 第 3 轮 N5 要求面板改名「所需胜率（底池赔率）」。
- T1 步骤 4 的 `rel(cs, b)` 定义为两个参数，使用时只传一个参数，建议直接写 plan 原文：`rel(board) = looseCat(hole+board) − looseCat(board)`，c 是改进牌当且仅当 `rel(board+c) > rel(board)`。

### T-10（建议）零散的执行信息

- `setSummary` 没有定义 `this.hand > hand` 的情况（按现有时序不会发生，写一句「忽略」即可）。
- T3 需要在 `AgentDeps` / `realAgents` 里加 `opponentTalk`，`defaultAgents` 的默认值要返回不发言，否则现有 runner 测试的公屏断言会被赛后消息干扰——task 只写了「AgentDeps 替身」。
- `talk()` 片段中 `void addMemory(...)` 没接 `.catch`，现有代码（`runner.ts:541`）有；片段里 `rid`、`note` 未定义，实施时照现有写法补上即可。

## 已核实无问题的点

- `opponentTurn` 即 task 所说「decide 流程」；`heroSituation`、`numsFor`、`equityFor`、`results`、`history/recent/remember/at`、`recap` 状态、`coachBusy`、`speakRetryKey`、`leaveCtrl` 均存在，task 的改法与之吻合。
- `addMemory(ownerId, text)` 存在；runner 测试用真实临时库（`tempDb`），「note 落库」可以直接用 `db.memoryOf` 断言。
- `rec.log[].seat`、`type` 可用来判定入池；`handName` 支持 2 张牌；`looseCat` 支持 3–7 张，plan 的 7 个改进牌例子按新口径逐个推算都成立。
- `Purpose` 只在 `types.ts`、`prices.ts`、`Stats.tsx`（`Record<Purpose, …>`，漏改会编译失败）三处穷举。
- `hotkeys.ts` 已对 INPUT 聚焦忽略快捷键；`index.css` 的 `--topbar` 为 `#f7f7f5`，与 T6 一致；`minWidth: 880` 存在。
- tsconfig 没有开启 `noUnusedLocals`，T1 暂留的 `equityFor` 调用不会导致检查失败。

## 检查限制

- 没有运行任何检查命令或测试，也没有做实机验证；DeepSeek 对 tool-call 历史的兼容性仍依赖 T7 实机确认。
- 没有逐行核对 `CoachPanel.tsx` 的工作区改动（重试按钮），也没有核对 `Stats.tsx` 的现有颜色。
