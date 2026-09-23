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

待核实（实施前的首个验证任务）：
- `libsql` 使用 Neon/N-API 原生模块（`@libsql/darwin-arm64/index.node`），在 Electron 打包时需要 `asarUnpack`；N-API 理论上无需针对 Electron ABI 重编译，需实测。
- `@mastra/core` 需要 ES2022 模块；Electron 主进程需以 ESM 构建（electron-vite 支持），需实测。
- 用户所选模型能否在一次 loop 内稳定调用“行动工具”；不稳定时的退化路径见方案。

## 业务数据存储

Mastra storage 只提供自身领域的表（thread、message、resource、workflow 快照等），不提供通用业务表。手牌历史、设置、筹码、提供方配置需在同一 SQLite 文件中另建 `river_*` 表，使用 `@libsql/client` 直接读写。API key 不以明文入库，使用 Electron `safeStorage` 加密后存储。
