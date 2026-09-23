# 方案审阅 1：River 桌面版技术方案（首稿）

## 本轮对象与版本

| 项 | 版本 / 位置 |
| --- | --- |
| 方案 | `plan.md`（2026-09-23 首稿，579 行，状态“待审阅”） |
| 需求与用户决定 | `discussion.md` §1（已批准第 3 轮方案）；讨论后的最后决定：“限一层”只由玩家和对手的“主动发言”引起回应，对手顺带接话的发言不引起回应 |
| 调查与决定 | `note.md`；`adr/001`~`003` |
| 设计稿 | `design-source/River.dc.html`（第 298–915 行的逻辑部分） |
| 工程证据 | `mastra-probe`：`@mastra/core` 1.69.0、`@mastra/memory` 1.31.0、`@mastra/libsql` 1.23.1 的 dist 源码与类型；本轮新跑了两个小实验（见“本轮实测”） |
| 前轮 | `reviews/design-1.md`～`design-3.md` |

## 结论：需修改

整体结构能落地。职责划分（TableRunner 是唯一写入者、工具只登记意图、按调用者身份裁剪视图）、状态和主循环都和已批准的讨论一致。design-3 提出的 M2–M5 在 plan 中都已处理。Mastra 的关键用法我逐项查了，大部分成立，详见文末“已核实成立”。

需要修改，主要是因为以下两处：

1. **用户最后的决定在 plan 里落实得不可靠（P1）。** “主动发言”和“顺带接话”的区分，全靠模型自己在 `say` 时填不填 `reply_to`。可是 decide 模式的 instructions 根本没让模型标 `reply_to`。结果是，对手在行动时顺手回玩家的话，大多会被当成“主动发言”，再引出一轮回应，正是用户明确排除的情形。另外，赢家发言从讨论稿里的“不触发”改成了“触发”，用户没有确认过。
2. **队列的抢占规则会丢掉每手结束写入的结果消息（P2）。** 这些消息是角色印象的事实依据，丢了会让“拟人记忆”缺少依据。

另外，“重置 AI 记忆”依赖一个 Mastra 没有提供的 API（P3），执行者没法照写。其余问题都可以随修订一并补上。

```
审阅发现在业务流程中的位置
 入座 ──► 对手决策 ─────► 公屏发言 ──────────► 手牌结束 ─────────► 下一手 / 设置
          │ P5 baseUrl     │ P1 主动/接话靠模型    │ P2 结果消息被抢占丢弃 │ P3 重置记忆无 API
          │   切换协议     │    自报 reply_to      │ P4 直接写 memory     │ P7 契约缺口
          │ P6 教练主动    │ P1 赢家发言改为触发    │    需拿到 storage     │ P8 讨论记录未同步
          │   排队规则缺失 │                       │                      │
```

## 问题（按严重程度）

### P1【中高，阻塞】“主动发言”靠模型自报 `reply_to`，但 decide 模式的提示没有要求标注；赢家发言改为“触发”，需要用户确认

**位置**：§公屏与回应的 triggers 表（第 359–369 行）；§opponentAgent 的 instructions 第 4、5 条（第 258–259 行）；§公屏与回应最后一段（第 386 行）。

**证据**：

- 判定规则是：decide 模式下的 `say` 如果没带 `reply_to`，就算主动发言，会触发回应。可是 instructions 第 4 条（decide 模式）只写了“想说话就调用 `say`”，完全没提 `reply_to`。只有第 5 条（chat 模式）要求带上 `reply_to`，而 chat 模式的发言本来就不触发回应，所以这个字段在 chat 模式里不影响结果。
- 模型要填 `reply_to`，得知道消息 id。id 只能通过 `read_chat` 拿到，而 decide 模式并没有要求先读公屏。
- 如果模型填的 `reply_to` 指向一条不存在的消息（模型编造了 id），应该怎么判定，plan 没写。

**后果**：

- 设想这样的链路：玩家说一句话，对手 A 行动时顺带回了一句，但没带 `reply_to`，于是被判为主动发言，引出 B、C 的闲聊。对玩家那句话来说，这已经是两层回应，恰好是用户最后一个决定要排除的“对手顺带接话引起回应”。
- 公屏的节奏和调用量会跟着模型的标注习惯走，换一个模型，行为就不一样了。
- 自动测试只能覆盖“按字段判定”这一层（第 559 行），测不出这个问题。

**赢家发言**：`discussion.md` §5.2 第 150 行，也就是用户批准的快照，写的是“赢家发言不触发”。plan 改成了“是（主动发言）”。按用户最后的决定，赢家发言不回应任何人，把它算作主动发言说得通。但这改动了一条已经批准的规则，带来两个具体影响：

- 调用量：每一手结束后，其余对手都要按健谈度抽样一轮闲聊。这些闲聊通常会在 4.5 秒后被下一手的决策抢占。
- 多个 AI 赢家（分池）时，是每人各发言一次、各引出一轮回应吗？plan 没写。原型对每个非玩家赢家各取一句台词（设计稿第 620 行）。

另外，赢家发言用的也是 chat 模式，而 `RequestContext.mode` 只有 `chat` 这一个值，`chat.ts` 分不清一次 chat 调用是赢家发言还是回应。需要加一个区分字段，或者单独设一个 mode。

**建议**（取舍由用户决定，下面只列出可选做法）：

- 最小修改：在 decide 模式的 instructions 里写明：“如果是在回应公屏上某条消息，先用 `read_chat` 查到它，`say` 时带上它的 `reply_to`”。同时写明 `reply_to` 指向不存在的消息时怎么判定，建议按“接话”处理，不触发回应。然后在方案里写清一条已知局限：是否算接话由模型自报，模型漏标时仍会引起一轮回应。
- 更确定的做法：不依赖模型自报。例如，某对手上次行动之后，公屏上出现过会触发回应的发言，那么它这次在 decide 模式里的 `say` 一律不触发。这种做法会把一部分真正的主动发言也挡掉，同样需要用户认可。
- 赢家发言：在向用户确认 plan 时单独点明“赢家发言由不触发改为触发”，并补上分池时的处理规则。
- 在 `RequestContext` 里给赢家发言加一个区分标记（例如 `mode: 'win'`，或 `trigger: 'win' | 'reply'`），并在 triggers 表中引用它。

结论：plan 对“主动发言”的定义方向是忠实的，但光靠现在的写法，执行结果达不到用户的原意。必须向用户说明，并补上 decide 模式的提示和兜底判定。

### P2【中】AgentQueue 抢占时会丢掉排队中的“手牌结果消息”任务，队列满时也会丢

**位置**：§串行队列与中止，第 238–239 行（`preempt=true` 时“丢弃排队中未开始的任务”；`preempt=false` 时“队列满（>2）时丢弃新任务”）；第 249 行（结果消息作为无 LLM 任务入队，“保证消息顺序”）。

**证据**：

- `AgentQueue` 的注释写的是，抢占时丢弃**所有**未开始的任务，而场景表第 245 行只说丢弃闲聊，两处说法不一致。
- 典型时序：一手结束时，对手 X 正在跑一次闲聊（最长 8 秒），结果消息排在它后面。4.5 秒后自动发下一手，X 在翻前决策时发起抢占，排队中的结果消息就被丢掉了。
- 队列满时丢弃新任务，结果消息也可能是被丢的那个。

**后果**：这一手的结果从没写进 X 的 thread。“被抓过的诈唬”“心情”这些 working memory 字段失去事实依据，而这正是用户要求的“尽量拟人”记忆的基础。赢家发言的输入只有一句“你赢了这一手”（第 386 行），它依赖的正是这条结果消息。

**建议**：把任务分为可丢弃（闲聊、赢家发言）和不可丢弃（结果消息）两类。抢占和队列满时只丢可丢弃任务；不可丢弃任务不计入容量上限，并且在抢占执行的决策之前先执行。结果消息是本地写入，只需几毫秒，不会占用决策时限。

### P3【中】“重置 AI 记忆”依赖的“删除 resource”API 在 Mastra 1.69 中不存在

**位置**：§数据最后一段，第 487 行。

**证据**：

- `@mastra/core` 的 `MemoryStorage`（`dist/storage/domains/memory/base.d.ts`）只有 `getResourceById / saveResource / updateResource`，没有 `deleteResource`。
- `@mastra/memory` 的 `Memory` 类（`dist/index.d.ts`）有 `listThreads`（第 154 行）、`deleteThread`（第 173 行）和 `updateWorkingMemory`（第 198 行），同样没有删除 resource 的方法。

**后果**：执行者只能自己拼一套做法，可能会直接 `DELETE` `mastra_*` 表，把内部表结构和 Mastra 的实现细节绑死。另外，如果在牌桌进行中重置，当前桌的 thread 被删之后，还会有 `saveMessages` 往里写，或者 agent 继续在上面调用。

**建议**：写明具体做法：

- 对 8 个 `opponent:<personaId>` 和 `hero`，逐个 `listThreads({ filter: { resourceId } })` 后调用 `deleteThread`。
- 用 `updateWorkingMemory({ resourceId, workingMemory: <模板> })` 把 working memory 重置为模板。
- 规定只能在不在牌桌时执行。或者先执行离桌，再重置。

### P4【中低】TableRunner 直接调用 `memory.saveMessages` 时，Memory 可能还没有 storage

**位置**：§opponentAgent 最后一段（第 308 行）；§共同约定中 `new Mastra({ agents, storage })` 的写法（第 198 行）；Memory 配置代码（第 281 行）没有传 `storage`。

**证据**：Memory 在 Agent 内部要等到 `getMemory()` 被调用时，才从 Mastra 实例注入 storage（`core/dist/agent-DwtTO5Px.js` 第 35800–35805 行：`if (!resolvedMemory.hasOwnStorage) resolvedMemory.setStorage(mastra.getStorage())`）。plan 中的 `new Memory({ options })` 没有自带 storage。

**后果**：如果 TableRunner 持有的是模块级的 Memory 对象，那么在该 agent 还没发起过任何一次调用时，写结果消息、`createThread` 或重置记忆都可能因为没有 storage 而失败。例如：本地引擎模式，或者应用启动后直接去“重置 AI 记忆”。

**建议**：一律通过 `await opponentAgent.getMemory()` 获取 Memory。或者在构造 Memory 时显式传入同一个 `LibSQLStore` 实例。另外补一句：`saveMessages` 的参数是 `{ messages: MastraDBMessage[] }`，`threadId` 和 `resourceId` 写在每条消息上，`content` 用 `{ format: 2, parts: [{ type: 'text', text }] }`。

### P5【中低】内置提供方填了 baseUrl，会被静默切换为 OpenAI 兼容协议

**位置**：§模型提供方，第 397 行（`baseUrl` 对内置提供方“可选”）；第 411 行（`{ id: \`${p.kind}/${modelId}\`, url: p.baseUrl || undefined }`）。

**证据**：`core/dist/llm-8rczBbL1.js` 第 8029–8039 行：只要 `config.url` 存在，就一律用 `createOpenAICompatible(...).chatModel()` 创建模型（除非 `api: 'responses'`），不再使用该提供方原生的 SDK。

**后果**：用户给 `anthropic` 或 `google` 填了代理地址后，请求会按 OpenAI Chat Completions 协议发出，调用失败。测试连接只会报一个笼统的错误，用户很难看出原因。

**建议**：规定只有 `openai-compatible`（或 `openai`）可以填 baseUrl，其他提供方在设置页隐藏这个字段。或者在 plan 里写明：填了 baseUrl 就按 OpenAI 兼容协议调用。

### P6【中低】教练相关的几条运行规则缺失

**位置**：§串行队列与中止的场景表（第 243–249 行）；§进程间契约的事件表（第 522–524 行）。

- **主动判断的排队规则没写**：场景表只写了“玩家提问”要抢占、“复盘”要排队。轮到玩家时发起的主动判断，如果上一次主动判断（最长 12 秒）还没结束，是抢占还是排队？如果照默认的 `preempt: false` 排队，新的判断会等到旧的结束才开始，经常因为 `heroKey` 已经变了而被整体丢弃，教练的提醒会迟到或者缺失，教学牌局“每一步至少 hint”也做不到。建议：新的主动判断抢占旧的；教练正在回答提问时，本次主动判断跳过。
- **流式事件没有请求 id**：`coach:delta` 和 `coach:done` 不带请求 id。玩家连续问两次时，第二次会抢占第一次，而被中止的第一次可能还在推送片段，Renderer 会把两段回答拼在一起。建议在负载中加上 `askId`。
- **失败怎么显示没写**：提问失败时，原型会显示“教练暂时没连上……”（设计稿第 560 行）；复盘失败时显示“复盘失败，稍后再试”（第 650 行）。plan 的 `coach:done` 和 `review:done` 都没有错误字段，也没说明失败的复盘是否写入 `river_reviews`。建议加一个 `error?` 字段，并规定失败时不落库。

### P7【低】契约与行为上的零散缺口

以下各项都不影响方案成立，但开发者需要自行补定，建议一次写清：

- **设置页的“最近调用信息”**（第 34、540 行）：显示最近一次调用的模型、耗时，以及本桌托管次数。这些数据没有对应的 IPC 命令或事件。
- **公屏与教练对话的恢复**：`table:view` 不含公屏记录和教练对话。`app.bootstrap` 只返回 `hasTable`，没有命令能取回当前的公屏和教练对话，Renderer 重载后会丢失。开新桌时怎样清空公屏，也没写。
- **`table.setChatShown`**：第 55 行说 Renderer 只持有面板开合这类 UI 状态，这个命令为什么要发到主进程，没有说明。
- **未定义的类型**：`HandSummary`、`Lobby`、脱敏后的 `Provider` 都没有给出字段。
- **测试连接的模型解析**：`provider.test` 测的是还没保存的 `{ providerId, modelId }`，而 `resolveModel` 只读 `settings.models[role]`，测试连接走哪条解析路径，plan 没写。
- **无 key 的兼容接口**：`api_key_enc BLOB NOT NULL` 会挡住不需要 key 的本地兼容接口（如 Ollama）。另外，删除一个正被 `settings.models` 引用的提供方时怎么处理，也没写。
- **本地引擎下的闲聊**：用户已配置对手模型、但把“决策引擎”选成“本地”时，闲聊和赢家发言还要不要调用 LLM？plan 只写了“未配置”的情况。原型在本地引擎下，公屏回复仍然会调用 LLM。
- **教学牌局的设置**：原型开教学牌局时会强制 `coachOn: true`、`level: 'novice'`，并给出开场提醒（设计稿第 410–411、817 行）。plan 没有提到。
- **`lastMessages`**：讨论稿定的是 20，plan 写成 40，没有给出理由。
- **`safeStorage` 解密失败**：讨论稿的风险表写着“失败则提示重新输入 key”，plan 没有保留。按现在的写法，`decryptString` 抛出的异常会被计为模型失败，触发熔断，用户看到的是“模型连续失败”，而不是“请重新输入 key”。
- **旧版本回退**：第 573 行说“旧版本忽略未知列”，但还需要一条规则：旧版本遇到比自己新的 `user_version` 时不报错、不降级。另外，`mastra_*` 表由新版 `@mastra/libsql` 迁移后，旧版是否还能读，没有核实。

### P8【低】用户的最后决定没有记入讨论记录

**位置**：`discussion.md` §1 第 21 行（仍是“限一层”）；§5.2 第 145–151 行（decide 模式下“含顺带回应别人”也触发，赢家发言不触发）。plan 第 3、579 行都把 `discussion.md` 列为依据。

**后果**：两份文档对同一条核心规则的说法相反，后来的读者或实施者可能按讨论稿去实现。

**建议**：在 `discussion.md` §1 补记用户的最后决定，写明它取代 §5.2 的触发表；或者在 plan 的“关键规则”旁注明“以本表为准，取代讨论稿 §5.2”。

## 已核实成立

| 核对项 | 结论 | 依据 |
| --- | --- | --- |
| 工具读取 RequestContext | `execute(inputData, context)`，用 `context.requestContext.get(key)` 读取，与 plan 第 211 行一致 | `docs-server-request-context.md` 第 249–250 行；`docs-agents-tools.md` 第 9 行 |
| `stopWhen` 中 `toolCalls` 的字段 | 元素形如 `{ toolCallId, toolName, args }`，plan 第 261 行的 `c.toolName` 成立（本轮实测） | `agent-DwtTO5Px.js` 第 29261、29273 行；`probe4.mjs` |
| `generate` 的选项 | `activeTools`、`toolChoice`（含 `'required'`）、`abortSignal`、`requestContext`、`memory.thread/resource` 都存在 | `reference-agents-generate.md` 第 87–205 行 |
| `createThread` 签名 | `createThread({ resourceId, threadId?, title?, metadata? })` | `core/dist/memory/memory.d.ts` 第 215 行 |
| `saveMessages` 签名 | `saveMessages({ messages: MastraDBMessage[] })`，thread 和 resource 写在消息上（见 P4） | 同上，第 173 行；`memory/dist/index.d.ts` 第 231 行 |
| `resolveModel` 的返回形态 | `{ id: 'p/m', url?, apiKey? }` 与 `{ providerId, modelId, url?, apiKey? }` 都是合法的 `OpenAICompatibleConfig`；后者会被规范化为 `${providerId}/${modelId}`，填了 url 就走 OpenAI 兼容协议，所以用本地 UUID 作 `providerId` 可行 | `llm/model/shared.types.d.ts` 第 24–37 行；`llm-8rczBbL1.js` 第 7775 行、第 8029 行 |
| 提供方注册表能否读取 | 可以。`import { PROVIDER_REGISTRY, getRegisteredProviders, getProviderConfig } from '@mastra/core/llm'`，实测共 208 个提供方，每项含 `name`、`url`、`models`。plan 第 415 行“首个任务确认读取方式”可以直接写成定论 | `llm/model/provider-registry.d.ts`；`probe5.mjs` |
| 删除 resource 的 API | 不存在（见 P3） | `storage/domains/memory/base.d.ts` |
| design-3 的 M2–M5 | 已处理：超过 2 秒后直接发起决策（第 245 行）；§10 的矛盾随讨论稿一同消失；排队中的闲聊丢弃（第 245 行）；教练的时限和步数表（第 221–227 行）；主动中止的调用不计入熔断（第 188 行） | plan 对应行 |

## 本轮实测

| 脚本 | 做法 | 结果 |
| --- | --- | --- |
| `mastra-probe/probe4.mjs` | 复用 probe3 的假模型，在 `stopWhen` 中打印 `steps.at(-1).toolCalls` | 输出 `[{"toolCallId":"c1","toolName":"slow","args":{}},{"toolCallId":"c2","toolName":"act","args":{}}]`，模型只调用 1 次 |
| `mastra-probe/probe5.mjs` | 从 `@mastra/core/llm` 读取 `PROVIDER_REGISTRY` | 共 208 项；`getProviderConfig('deepseek')` 返回 `url`、`name`、`models` |

## 检查限制

- 没有在 Electron 主进程或打包产物中运行 Mastra，也没有调用真实提供方。
- P4 依据的是源码中 storage 的注入时机，没有实际构造“未注入 storage 就调用 `saveMessages`”的失败场景。
- 没有核实新版 `@mastra/libsql` 的表迁移对旧版本是否兼容。
- 仍然没有读到 `poker.js` 原文，`decide`、`equity` 的行为以 plan 和原型调用处为准。
- 页面方面，只把设计稿的逻辑段（第 298–915 行）与 plan 的页面表逐项对照了，没有逐像素核对模板中的视觉细节。
