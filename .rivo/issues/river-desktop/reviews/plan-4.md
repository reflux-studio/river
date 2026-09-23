# 方案审阅 4：River 桌面版技术方案（第 4 轮）

## 本轮对象与版本

| 项 | 版本 / 位置 |
| --- | --- |
| 方案 | `plan.md`（第 4 轮快照，592 行，状态“待审阅第 4 轮”） |
| 用户决定 | `discussion.md` §1（第 5–30 行） |
| 前轮 | `reviews/plan-3.md`（结论“需修改”：M1 阻塞；L1、L2 低；另有不阻塞的残留项） |
| 工程证据 | `mastra-probe`：`@mastra/core` 1.69.0、`@mastra/memory` 1.31.0、`@mastra/libsql` 1.23.1 的 dist 源码与类型 |

## 结论：通过

M1 已经从根上解决：复盘不再进入教练队列，也就不存在被 proactive、ask 抢占或丢弃的问题。“复盘独立队列可以与教练队列并行”这个前提，经源码核实成立（见下文“前提核实”）。L1、L2 和前轮列出的不阻塞项都已处理，修订内容与全文一致。本轮新发现两处，都属于低优先级，可以在实施时顺手补上，不需要再改方案后重审。

## 前轮问题处理情况

| 前轮 | 处理 | 依据（plan 行号） | 评价 |
| --- | --- | --- | --- |
| M1 复盘被教练队列抢占 | 复盘进入独立的“复盘队列”，与教练队列互不抢占；review 模式的 `activeTools` 只有 `recent_hands`，没有 `updateWorkingMemory` | 230、252、337 | 已处理。改法比前轮建议的“proactive 遇到 review 也跳过”更干净：不用在调用方再加特判，AgentQueue 接口保持不变。并行的安全性见下文 |
| L1 被中断的回答怎么显示 | 被新提问中止的回答保留已输出的部分，标“已中断”，事件为 `coach:done { ok: false, error: 'interrupted' }`；其他失败显示“教练暂时没连上” | 336 | 已处理 |
| L2 重载后公屏为空；505 行表格被破坏 | `app.bootstrap` 同时返回 `coachThread` 和 `chat`；说明文字移到表格下方的 523 行 | 505、523 | 已处理，表格格式正常 |
| 残留：`table.setChatShown` | 从命令表移除，改为 Renderer 本地保存 | 523 | 已处理 |
| 残留：删除仍被引用的提供方 | 删除时同时清空对应角色的模型选择，之后按 428–429 行的“未配置”处理 | 523 | 已处理（牌桌进行中删除的情况见 P2） |
| 残留：教学牌局缺 hint | 335 行写明“教学牌局中这一步因此可能没有 hint……可以接受” | 335 | 已处理 |

## 前提核实：复盘与教练队列并行，会不会覆盖 working memory

```
review 调用（resource = hero，thread = review:<handId>）
  │
  ├─ 模型可见的工具 ── activeTools 过滤 ── 只有 recent_hands          ✓ 看不到 updateWorkingMemory
  ├─ 模型仍然调用 updateWorkingMemory ── 执行前检查 isHiddenByActiveTools
  │                                   └─ 返回 ToolNotFoundError，不执行   ✓ 不写 WM
  ├─ 调用结束后 Memory 自动写 WM？ ── 只有 observational memory 的
  │                                   WorkingMemoryExtractor 会写；plan 没有启用 OM   ✓ 不会
  ├─ createThread / saveThread 写 resource？ ── 只在 thread.metadata.workingMemory
  │                                   是字符串时才写；plan 不传这个字段           ✓ 不会
  └─ 保存消息 ── 写入 thread review:<handId>；教练用 coach:<tableId>        ✓ 不冲突
```

| 核对项 | 结论 | 依据 |
| --- | --- | --- |
| `activeTools` 只影响模型能看到哪些工具吗 | 不只影响可见性。执行阶段也会拦截：`isHiddenByActiveTools` 为真时直接返回 `ToolNotFoundError`，不执行工具 | `core/dist/agent-DwtTO5Px.js` 第 161 行（过滤工具定义）、第 28438–28446 行（执行前拦截） |
| 除工具外，Memory 还有没有别的路径写 WM | 写 `updateWorkingMemory` 的地方只有四处：WM 工具（23471）；observational memory 的 `WorkingMemoryExtractor`（22358，需要启用 OM）；`copyThread`/`cloneThread`（32754，plan 没有用到）；`saveThread` 中的 `handleWorkingMemoryFromMetadata`（31394–31403，需要 `thread.metadata.workingMemory`）。按 plan 的配置，这几条都走不到 | `memory/dist/src-zTE4189S.js` 对应行 |
| review thread 与教练 thread 冲突吗 | 不冲突。两者只是 resource 相同（都是 `hero`），消息分别存在各自的 thread。WM 为 resource 作用域，review 只读取它。plan 没有启用语义召回，所以 review 的消息不会进入教练对话的上下文 | plan 339 行；同上源码 |
| 复盘失败会不会影响熔断 | 不会。熔断只统计对手决策和教练的主动判断、提问（190 行）；教练熔断后停用的也只是主动判断和提问（193 行），复盘不受影响 | plan 190、193 行 |
| “重置 AI 记忆”会不会漏掉复盘队列 | 495 行写的是“等待所有 AgentQueue 清空”，按字面理解包含复盘队列。见 P1 中的措辞建议 | plan 236、252、495 行 |

## 一致性核对

| 核对点 | 结论 |
| --- | --- |
| 230 行 review 的 `activeTools`，与 221 行“各模式都包含 `updateWorkingMemory`” | 230 行括号里写了“不写记忆”，是明确标出的例外，不算矛盾。建议把 221 行改成“除 review 外都包含”，免得执行者只读 221 行 |
| 236 行“每个 agent 实例一个 AgentQueue”，与 252 行新增的复盘队列 | 236 行给出的原因是 working memory 的读-改-写；复盘不写 WM，所以另开一个队列并不违背这个原因。只是 236 行列举的队列没有包括复盘队列，见 P1 |
| 337 行“同一手重复点击忽略”，与“失败后可重试” | 一致：进行中的重复点击忽略；失败后可以再次提交 |
| 505、523 行 bootstrap，与 541 行 `TableView` | 一致。公屏记录不放进 `TableView`，由 bootstrap 一次性给出，之后通过 `chat:append` 增量推送 |
| discussion.md 第 120 行“教练提问/复盘”共用一套工具（含 `updateWorkingMemory`） | plan 把复盘单独收窄为只读，属于 AI 委托范围内的实现选择（Memory 的用法由 AI 决定，见 discussion 第 17 行），不违背用户决定 |

## 新发现（都不阻塞）

### P1【低】复盘时 Memory 仍会给出“必须调用 updateWorkingMemory”的系统指令

**证据**：`Memory` 生成 WM 系统指令时，只有 `readOnly` 或 `agentManaged === false` 才改用只读指令（`memory/dist/src-zTE4189S.js` 第 31874 行）。`activeTools` 不影响这段指令。所以复盘调用会收到第 32129–32158 行的指令，其中包括“You MUST call updateWorkingMemory……”，但这个工具在复盘时被隐藏了。

**后果**：数据不会出错，上文已核实执行时会拦截。但模型可能照着指令去调用这个工具，得到 `ToolNotFoundError`，白白用掉一步（`maxSteps` 6、时限 45 秒），个别模型还可能因此在回答里提到这个错误。

**建议**：复盘调用传 `memory: { thread, resource: 'hero', options: { readOnly: true } }`。`readOnly` 会同时去掉 WM 工具，并改用只读的 WM 指令（第 32479、31874 行），还会停止保存消息（第 30627–30639 行）。复盘文本本来就另存在 `river_reviews`，不保存消息也没有损失，`review:<handId>` thread 可以不再持久化。另外，236 行可以补一句“另有一个复盘队列，见 252 行”，这样 495 行“所有 AgentQueue”指的范围就明确了。

### P2【低】边界情况的事件推送没有写明

- **复盘被拒或被中止**：`AgentQueue` 的规则是“可丢弃任务在队列满（>2）时被拒”（242 行）；离桌会“中止所有 agent 调用”（180 行），可能也会波及复盘。337 行只写了“失败推送 `review:done` 带 `error`”。建议写明：被拒、被中止也算失败，同样推送 `review:done { error }`。否则连续对多手点复盘时，被拒的那一手会一直显示加载中。另外，复盘和牌桌无关，离桌时是否需要中止复盘，可以一并说明。
- **牌桌进行中删除提供方**：角色的模型选择被清空后，`resolveModel` 中的 `sel` 为 `undefined`，会抛错（413–420 行）。如果调用前不先检查“未配置”，这一桌就会走“失败 → 托管 → 熔断”，而不是 428 行规定的“本地引擎、不标托管”。建议在发起调用前检查“未配置”，或者规定牌桌进行中不能删除提供方。
- **“已中断”标记在重载后丢失**：`coachThread` 的元素是 `{ role, text, requestId }`，不带中断状态，Renderer 重载后这个标记会消失。影响很小。

## 检查限制

- 只读了 plan 和 Mastra dist 源码，没有运行代码。“activeTools 在执行阶段拦截隐藏工具”是按源码推断的，没有用假模型实测。
- `readOnly` 这个单次调用选项在 `getMergedThreadConfig` 中的合并路径，只核对了 `listTools` 和 WM 指令这两处的判断，没有追到 agent 把 `memory.options` 传给 Memory 的完整调用链。
- 没有重新核对前几轮已经核实的接口（`listThreads`、`PROVIDER_REGISTRY` 等），也没有读 `poker.js` 原文和设计稿。
