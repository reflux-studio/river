# Web 与好友联机的现状调查

负责人：Codex。代码基线：`55198ddaa9d2355cbd6530b87536a77ac828c652`，调查日期：2026-11-02。调查开始时工作区干净。

## 调查范围

核对现有浏览器复用基础、单人假设、数据与模型隔离，以及联机缺口。读取 README、workspace 配置、相关实现与项目知识库；没有启动应用、执行集成测试、调用模型或部署服务。

知识库 `.rivo/knowledge/README.md` 的结构部分标注核实于 2026-09-26 / `05395c3`，信息隔离与 Agent 规则标注 2026-09-25 / `3ba346c` 及 unified-agent 改动；本次以下结论以实际代码为准。没有修改旧知识库或旧需求。

## 调查结论

### 浏览器复用基础已存在

`packages/engine` 提供牌局规则，`packages/ui` 提供 React 牌桌展示，`packages/i18n` 提供双语内容。官网的 `apps/site/src/sim/to-seat-view.ts` 将引擎数据交给 UI 展示，证明现有代码已有浏览器消费路径。它是演示桌，不能证明浏览器具备完整单人教学、存储和模型配置能力。

依据：各包 `package.json`、`apps/site/src/sim/to-seat-view.ts`、`README.md`。证据类型：源码与文档核对，未运行浏览器验证。

### 完整应用依赖 Electron 主进程

界面在 `apps/desktop/src/renderer/src/lib/river.ts` 直接读取 `window.river`，preload 将 invoke/on 绑定到 Electron IPC。主进程统一创建 TableRunner，以 `safeStorage` 加解密模型 Key，连接本地 SQLite。完整 Web 需要替换通信、存储与宿主能力，而不只是新增 HTML 入口。

依据：`apps/desktop/src/preload/index.ts`、`apps/desktop/src/main/index.ts`、`apps/desktop/src/main/ipc.ts`。证据类型：静态调用链核对。

### 引擎支持多座位，运行层固定单人

`Table` 接受座位数，按座位维护筹码和行动。`TableRunner.start()` 固定创建 hero 为 0 号座位，其余为 AI；`heroCanAct()`、`heroLegal()`、结果净收益与离桌结算都依赖 0 号位。多真人应复用引擎，新增或重构运行调度与玩家视角；不能只给旧 heroAct 命令增加一个 seat 参数。

依据：`packages/engine/src/table.ts`；`apps/desktop/src/main/table/runner.ts` 的 start/leave/heroAct/heroCanAct；`apps/desktop/src/main/table/view.ts` 的 heroLegal/buildTableView。证据类型：源码核对与改造范围推断。

### 数据和模型环境目前只有一个用户上下文

DB 模块有全局 settingsCache、personasCache、providersCache；模型解析器从同一 settingsCache 读取角色模型。LLM 模块只有一个全局 onUsage 回调，每次 TableRunner 构造会覆盖它。因此即使每房实例化一个 runner，也没有实现配置、记忆和费用归属的房间隔离。

依据：`apps/desktop/src/main/db/index.ts:50` 起；`apps/desktop/src/main/models/resolve.ts`；`apps/desktop/src/main/agents/llm.ts` 的 setUsageListener；`apps/desktop/src/main/table/runner.ts` 构造函数。证据类型：源码核对。

### 多人需要重新界定信息可见性

现有 buildTableView 只为一个 hero 生成视图，并在教练局结束时亮出全部底牌。多人需以已认证玩家和服务端座位绑定生成视图，连同回放、公屏、教练上下文分别授权。AI 应仅接收自己底牌与公开信息；邀请链接不应授予其他玩家的身份或底牌访问权。

依据：`apps/desktop/src/main/table/view.ts` 的 reveal 条件；`apps/desktop/src/main/table/runner.ts` 中按 AI seat 生成 situation 的路径。证据类型：源码核对与联机约束推断。

### 现有事件水位可参考，但不等于重连协议

FeedbackSync 已使用 revision、seq、tableId 和初始快照过滤旧视图和音效，但没有在该组件中实现网络重连、消息缺口补齐或动作幂等。旧音效过期判断依赖客户端与事件时间差，跨机器可能存在时钟差。网络版需独立设计恢复快照、动作确认与过期事件处理。

依据：`apps/desktop/src/renderer/src/lib/feedback-sync.ts`；`apps/desktop/src/shared/types.ts` 的 Commands。证据类型：源码核对与网络适配推断。

### 手机不是现有布局的自然延伸

App 外层最小宽度 880px，Electron 窗口同样设置 minWidth 880。Table 页面在 1280px 以下默认折叠公屏，但不能据此认定手机可用。若首版包含手机，应设计操作栏、座位视角、教练面板与浏览器后台恢复。

依据：`apps/desktop/src/renderer/src/App.tsx:28`、`apps/desktop/src/main/index.ts` createWindow、`apps/desktop/src/renderer/src/pages/Table.tsx`。证据类型：源码核对，未做视觉验证。

### 洗牌随机源要按联机场景重新处理

Table 和当前 TableRunner 默认使用 Math.random，Deck 调用可注入 rng 的 shuffle。多人版本应由服务端持有牌堆与随机源，保留可注入随机源用于测试，生产洗牌采用密码学随机源并正确处理离散取样。Node 的 randomInt 文档明确其整数采样避免模偏差，但本次没有实现或验证新的洗牌算法。

依据：`packages/engine/src/table.ts` 构造函数、`packages/engine/src/deck.ts`、`packages/engine/src/eval.ts:11`；[Node crypto.randomInt](https://nodejs.org/api/crypto.html#cryptorandomintmin-max-callback)。证据类型：源码核对、官方 API 文档与设计建议。

## 多人交互补充核对（同一代码基线）

- `shared/types.ts` 的 ChatMessage 已区分 sys/act/msg，但 `renderer/src/components/table/ChatPanel.tsx` 明确是只读公屏，Commands 尚无真人发送消息入口。消息展示可复用，发送路径需要新增。
- `renderer/src/pages/Stats.tsx` 已对 HandSummary.net 求和，显示胜率、VPIP/PFR 和摊牌胜率；`runner.ts:onHandEnd` 固定取 0 号位收益。统计不是从零建设，需扩展为任意参与者、房间整场与本地累计。
- `main/table/view.ts:buildTableView` 以固定条件决定底牌揭示，`engine/src/table.ts:showdown` 负责结算但无玩家自愿展示命令。亮牌主要是 runtime 生命周期和视图政策，不能简单让客户端自行展示任意牌面。
- `main/agents/opponent.ts` 已有 act/talk 工具与赛后发言路径，talk 不阻塞下一手，act 模型调用超时 45 秒并允许重试。这可作为工具接入基础；新增亮牌展示窗口和决策截止后需重新限定工具有效期。

证据类型：静态源码核对。以上支持“已有复用基础”，不代表计时、预约、亮牌或真人聊天已经实现。

### Agent 超时与移除座位补充核对

`main/agents/opponent.ts:46` 写死决策时限 45 秒，act 传 maxRetries: 2，talk 为 20 秒；`agents/llm.ts` 将调用超时与外部取消组合为 AbortSignal。`shared/types.ts:Settings` 和 `renderer/src/pages/Settings.tsx` 未提供模型调用超时设置。当前 runner 在对手决策失败时设置 stalled，retry 清除后继续，这与用户要求的人工重试方向相近，但尚无移除 AI 命令。

`engine/src/table.ts:standUp` 只能在两手之间执行；legalActions 在无需跟注时提供 check 而不提供 fold。因此手中“踢出 AI”不能等同直接删除座位或普通 fold，需明确定义管理性弃牌与延后离座，并保留底池与边池资格的正确处理。证据类型：静态源码核对。

### 10 人与筹码补充核对

`shared/types.ts:Lobby.size` 与 `renderer/src/pages/Lobby.tsx` 人数选项都只到 6。`packages/ui/src/seat.tsx` 按人数均分极坐标，卡片与气泡尺寸固定；`table-stage.tsx` 最小高度 560px。动态位置不代表 10 人手机布局已验证。

`packages/i18n/src/presets.ts` 每种语言只有 8 个内置角色，runner.start 按可用角色数缩小桌子。一真人九 AI 需处理角色数与实例配置，不能继续静默缩桌。

engine 使用动态座位数组，actionTaken 经 put 更新投入；现有 runner.leave 在模型故障时会 abortHand 作废本手。这不能直接作为新联机退出政策，需将退出与作废手显式区分，避免退回有效下注。

证据类型：静态代码核对，未执行 10 人规则或视觉验证。

### 本轮教练、恢复与观战计算核对

`runner.ts:heroCanAct/locked` 将教练 busy/spokenKey 与行动资格绑定；新的非侵入式教练 hook 需要解除这些运行层条件，不能只移动面板代码。

`engine/src/eval.ts:equity` 只接受本人底牌、公共牌及对手人数，对手底牌随机抽样，没有接收实际多方手牌或死牌的参数，不能直接用于观战真实牌面胜率。`Table` 与 `Deck` 当前没有显式恢复接口；剩余牌堆是私有数组，仅存座位和公共牌不足以恢复同一手。

证据类型：静态代码核对。多人观战胜率与重启恢复尚未实现或实验验证。

## 外部技术核对

2026-11-02 编写方案时补充核对 [ws 官方文档](https://github.com/websockets/ws/blob/master/doc/ws.md)、[SQLite WAL](https://www.sqlite.org/wal.html) 与 [原子提交](https://www.sqlite.org/atomiccommit.html)。用途是支持 noServer/HTTP 升级与本地事务持久化选型；FULL 同步和 WAL 的配置需要实施时对实际 libSQL 文件库读取验证，不能从文档推定当前部署已生效。当前 lockfile 已有 ws 8.21.3（传递依赖），新 server 仍需声明直接依赖。证据类型：官方文档及本地 lockfile，未运行新服务。

[OWASP WebSocket 安全指南](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html) 说明 WebSocket 本身不提供认证，要求消息级授权、输入校验和连接来源检查。用于支持网络入口需要独立权限边界的判断，不代表已对本项目完成安全验证。

## 未查明的部分

用户规模、托管环境、模型费用和权限模式尚未确定；问题分别归产品决定记录和技术决定记录。本次没有进行引擎多人场景完整审计、第三方框架选型、并发压测、掉线恢复实验或模型调用迁移实验。当前结论可支持范围讨论，尚不足以宣称实施就绪。
