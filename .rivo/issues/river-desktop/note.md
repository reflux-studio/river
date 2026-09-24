# River 桌面版：调查笔记

## 调查范围

目标：把 claude.ai/design 项目 `2a5400ca-ac09-4130-865d-820403b275ac` 中的 `River.dc.html` 原型实现为桌面应用（Electron + shadcn/ui + Mastra）。
适用版本：设计稿读取于 2026-09-23；Mastra 依据 `@mastra/core` 1.69.0、`@mastra/memory`、`@mastra/libsql` 最新版的内置文档与类型（在临时目录安装后查阅）。

## 设计原型的实际行为

当前认识：原型是一个单文件 React 组件（dc 运行时渲染），牌局规则由 `poker.js` 实现，全部 LLM 能力通过 `window.claude.complete` 直接在前端调用。`support.js` 是设计工具的模板运行时，与产品无关。

页面与功能：

| 页面 | 行为 |
| --- | --- |
| 大厅 | 三个预设桌；人数 2–6；盲注 10/20、50/100、100/200；买入 100BB；选对手；教学牌局；最近 5 手 |
| 牌桌 | 左侧公屏（可收起，含玩家输入框）；中间椭圆桌、座位、下注筹码、公共牌；底部操作区与 F/C/R/N 快捷键、下注预设、加注步进；右侧教练栏 |
| AI 对手 | 8 个角色卡：性格提示词可编辑、三项倾向条、加入下一桌 |
| 手牌回放 | 列表 + 按街道的行动、摊牌信息、教练复盘 |
| 数据统计 | 已打手数、净盈亏、赢下比例、VPIP、PFR、摊牌胜率、每手盈亏柱状图（最近 40 手） |
| 设置 | 引擎、模型、话痨程度、思考速度、教练开关/人设/深度、硬核模式、自动下一手、LLM 用量、规则、清空记录 |
| 规则引导 | 5 页首启弹窗，末页可进入教学牌局 |

牌局引擎（`poker.js`，约 150 行纯函数）：`newGame / startHand / legal / apply / progress / showdown`，支持边池分配、单挑盲注规则、全下后自动发完（runout）。`equity` 用蒙特卡洛对随机手牌估算胜率，`outs` 估算改进张数，`decide` 按 tight/aggr/bluff/call 四个倾向做本地决策。

原型中的 LLM 调用与失败处理：

| 调用 | 输入 | 输出 | 失败时 |
| --- | --- | --- | --- |
| 对手决策 | 该对手视角快照 + 可选行动 | `{action,to,say}` JSON（正则提取） | 退回 `decide()` + 预设台词 |
| 教练主动 | 玩家视角快照 + 本地计算 | `{tool:silent/hint/pause,message}` | 静默 |
| 教练问答 / 复盘 | 快照 + 最近 12 条对话 | 文本 | 显示“暂时没连上” |
| 公屏回复 | 所有对手提示词 + 最近公屏 | `[{name,text}]` | 预设台词 |

原型用 60 秒内 14–15 次的调用预算保护 `window.claude`，并按优先级预留给教练。发言泄牌只靠提示词约束加正则过滤。

依据：`design-source/River.dc.html` 第 298–915 行；`poker.js` 取自同一设计项目。

## Mastra 能力核对

| 需求 | 结论 | 依据 |
| --- | --- | --- |
| SQLite 存储 | `LibSQLStore({ id, url: 'file:<path>' })`，可存 memory、workflow 快照、trace | `@mastra/libsql` 文档 integrations-databases-libsql |
| 用户自配提供方 | Agent `model` 可为 `({ requestContext }) => ...`；返回值可为 `{ id: 'provider/model', url?, apiKey?, headers? }` 或 `{ providerId, modelId, url?, apiKey? }` | `docs-server-request-context.md`；`dist/llm/model/shared.types.d.ts` `OpenAICompatibleConfig` |
| 跨会话记忆 | working memory 默认 resource 作用域，跨 thread 持久；libSQL 支持 `mastra_resources` 表；可自定义 Markdown 模板 | `docs-memory-working-memory.md` |
| 控制 agent loop | `generate` 支持 `maxSteps`（默认 5）、`stopWhen`、`abortSignal` | `reference-agents-generate.md` |
| 工具 + 结构化输出 | 部分模型不能同时用；可用 `jsonPromptInjection: 'auto'`、独立结构化模型或 `prepareStep` 规避 | `docs-agents-structured-output.md` |

适用边界：以上为文档和类型核对，尚未在 Electron 主进程中实际运行。

T1 实测结论（2026-09-24，@mastra/core 1.69.0、@mastra/memory 1.31.x、electron 44.4.5、electron-builder 26，证据 evidence/T1/）：
- 主进程 ESM 可加载 Mastra；LibSQLStore 建出 44 张 `mastra_` 表；打包后 libsql 原生模块经 asarUnpack 正常加载。
- Memory 注入的工具名为 `updateWorkingMemory`；`activeTools` 过滤后仍可调用它写入 working memory。
- `stopWhen` 回调中 `steps[].toolCalls` 元素为 `{ toolCallId, toolName, args }`；同一步内其他工具会执行完。
- 被中止的 `generate` 返回 `finishReason: 'aborted'` 不抛错；带 Memory 的 Agent 即使被中止也必须传 `memory: { thread, resource }`。
- 未签名应用在覆盖安装新版本后，safeStorage 仍能解密旧密文（钥匙串条目 “River Safe Storage”）。
- pnpm 11 必须用默认 isolated 布局：hoisted 下 electron-builder 26 按 `pnpm list` 收集依赖会装错嵌套版本（`@ai-sdk/provider`）导致启动失败。
- 开发与打包默认共用 userData `~/Library/Application Support/River`。

T3 实测结论（2026-09-24，@libsql/client 0.18.x，证据 evidence/T3/r3-busy.md）：
- `file:` 客户端是连接池，`PRAGMA foreign_keys` 只对执行它的连接生效，`ON DELETE CASCADE` 不可依赖。
- Mastra 与业务层写同一 `river.db` 时，Mastra 跨多个 await 持有写事务，业务写会立即得到 `SQLITE_BUSY`；设置 `busy_timeout` 会在主线程同步阻塞。
- libsql 0.18 缺陷：一次写得到 `SQLITE_BUSY` 后，该连接滞留在未提交事务中并持锁；之后在这条连接上的写“返回成功、自己可读”，但其他连接永远读不到（静默丢写）。只做退避重试不够，必须换一条干净的连接，而连接池无法单独丢弃某条连接，只能关闭整个 client。
- 因此业务层与 Mastra 必须各自建 client（同一文件）：业务写遇到 BUSY/LOCKED 时关闭并重建自己的 client，再异步退避重试（100ms 起，5 次）；Mastra 用 `new LibSQLStore({ id, url })` 自建 client，不能共用业务 client（关闭会打断 Mastra 事务）。
- 实测：4 个业务 worker 2000 次写与 Mastra 300 轮重负载并发，全部落库、事件循环不被阻塞。Mastra 自身的 BUSY 重试不换连接，理论上仍有静默丢写风险；业务写不跨 await 持锁，实测 Mastra 未遇 BUSY。新增其他写入方时需重新评估。

T4 实测结论（2026-09-24，@mastra/core 1.69.0，证据 evidence/T4/、reviews/T4-1.md）：
- `agent.generate` 调用模型的 `doGenerate`，只有 `stream` 走 `doStream`；mock 模型与假端点两者都要实现。
- `generate` 遇模型错误不一定抛出，可能返回带 `error` 的结果；调用方需同时处理抛出与返回错误。
- `memory.options.readOnly: true` 仍会创建 thread，但不保存消息，模型拿不到 `updateWorkingMemory`。
- resource 作用域下 `memory.updateWorkingMemory` 不要求 thread 存在，`threadId` 可为占位值。
- Mastra 1.69 会拒绝执行不在 `activeTools` 中的已注册工具，但项目不应依赖这一点做信息隔离：对手与教练 agent 分别注册各自的工具，工具内再校验调用者角色。

T9 打包结论（2026-09-24，electron-builder 26，macOS arm64）：
- `mac.identity: null` 会留下残缺的链接器签名；带下载隔离标记时 macOS 直接提示“已损坏，应移到废纸篓”，系统设置中没有放行入口。
- 改为 ad-hoc 签名（`identity: '-'`）后，未公证的应用走“无法验证开发者”流程，可在“隐私与安全性”中手动允许。
- ad-hoc 签名同时开启 hardened runtime 时，库校验会拦下 libsql 的 `.node`；hardened runtime 只在公证时需要，因此关闭（`hardenedRuntime: false`）。

## 业务数据存储

Mastra storage 只提供自身领域的表（thread、message、resource、workflow 快照等），不提供通用业务表。手牌历史、设置、筹码、提供方配置需在同一 SQLite 文件中另建 `river_*` 表，使用 `@libsql/client` 直接读写。API key 不以明文入库，使用 Electron `safeStorage` 加密后存储。
