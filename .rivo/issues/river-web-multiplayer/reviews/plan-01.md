# River 跨端与好友联机方案审阅

- 被审对象：`../plan.md` 草稿及 `../assets/protocol.md`、`../assets/state-storage.md`、`../assets/interface.md`、`../assets/runtime.png`，2026-11-02 首轮。
- 审阅者：独立子代理 `/root/plan_review`，未参与方案编写。
- 结论：**不通过（2 个 P0、2 个 P1）**。

## 复述

本期把桌面应用重构为共享 React app、client、协议和权威运行核心。Electron 本地通过 IPC 使用本机 Node runtime，联网的 Web/Electron 使用同一个 WS Node 服务；模型和 Key 仅在 Electron。玩家无需账号，公共服务只维护房间与当前牌局，SQLite 原子保存状态、命令结果及按接收者裁剪的记录。长期战绩保存在各端 SQLite/IndexedDB，不维护统一筹码钱包。

范围包括十人真人/AI 混合桌、手中买入/卖出、资金流校正后的收益统计、独立真人/Agent 在线管理、人工处理 Agent 决策失败、30 秒真人计时、60 秒掉线宽限、10 秒展示、自主单张/双张亮牌、自由公屏和全局暂停。私有教练非阻塞，手后全亮与教练独立默认关闭；娱乐房场下透视默认开启，仍争池的全下者不获得透视。

实施先定义契约与纯核心，再迁移桌面与旧数据、建设 WS 服务和 Web、验证十人响应式与跨端故障场景。验证安排区分纯规则、真实 WS/SQLite、进程崩溃恢复、迁移和实际设备交互；当前提交只是设计，尚未证明这些验证已经通过。

## 问题

| 编号 | 级别 | 位置 | 证据与后果 | 建议 |
| --- | --- | --- | --- | --- |
| R1 | P0 | `assets/protocol.md` 的 archive.get、RoomView/Effect、投影恢复；`assets/state-storage.md` 的 HistoryStore.apply 与 personal_archives | 历史持久化需要 PersonalHandPatch、FundingEntry 和稳定 cursor，但这些个人记录的网络结构与活跃期间追赶路径未定义。RoomView 只有当前手，Effect 只规定展示事件，WS viewSeq 又会随 generation 重置。假设真人离线期间完成一手并发生多笔资金流，重连 reset 只能恢复当前桌面，不能据此补齐离线手的日志/净收益、已变更亮牌权限和完整资金流水。archive.get 目前仅写为“archive 绑定凭证”与 `{items,nextCursor,done}`，没有规定在活跃房间何时读取、稳定历史版本、分页期间一致性或提交本地游标的对应关系。客户端和存储实现者无法独立对接必需的永久战绩，遗漏 F4/F8。 | 定义与 WS 展示序号分离的个人 archiveRevision/游标、完整 PersonalHandRecord/Patch/Funding/RoomSummary 结构、活跃/关闭房间的读取授权；明确首次绑定、手结算、亮牌修订、重连、资金确认与关房的历史同步触发和原子确认流程。 |
| R2 | P0 | `plan.md` F6“展示之后自动下手”；`assets/protocol.md` room.start/seat.sit/funds 命令；缺少后续开手人数不足状态 | 首手 start 有“至少两名已入座且资金>0”的校验，但展示结束/skip 后只定义自动下手，没有定义少于两名可参与者的路径。用户允许随时卖出到零、暂离、离座和移除，所以两人桌结算后只有一人有筹码，或其余全部 sitOut，是正常场景。现有 `packages/engine/src/table.ts:94–97` 明确在 live<2 时抛错。照自动下手调用会失败；若停在 showing，也没有定义后续买入/入座怎样自动恢复，不满足完整连续对局流程。 | 定义通用开手 guard：两名以上满足资格且筹码>0时开手，否则进入明确 waiting/ready 状态。规定 sit/buyIn/回归/移除后的重新评估、首手仍需 host.start 而后续是否自动恢复，以及 ghost/pending/sitOut 的计数时点；加入相应验证。 |
| R3 | P1 | `assets/protocol.md:14` Chip、ParticipantView.stack/pendingStack/bet/totalIn、HandView.pot；`plan.md` 共同定义 | Chip 的说明给出单金额 0..1,000,000,000，但同一类型又用于累积余额与底池；正文只要求累加保持安全整数，没有要求余额总额≤此单笔上限。两笔各 10 亿的合法买入就得到 20 亿 stack，按统一 Chip schema 解释将无法序列化合法状态；若各端自行放宽，输入与输出校验又不一致。 | 分开单次输入金额和累积筹码类型/校验范围，或明确资金命令在总额上限上的拒绝条件。保证服务端、持久状态和投影使用一致范围。 |
| R4 | P1 | `assets/protocol.md` HandView/DecisionView 及“其他接收者只见 actingSeatId、状态与公开 human deadline” | 文字要求向非行动接收者展示公开状态和 human deadline，但 HandView 只提供 actingSeatId 与 DecisionView；而后者包含仅当前控制端可见的 legal/attempt，且字段全部必填。非行动视图只能把 decision=null（丢失公开计时/状态），或者发送不符合类型的部分对象。 | 将公共决策状态/截止时间与 actor 私有 legal/attempt 分开定义，或给出明确判别联合，避免客户端靠省略必填字段实现隐含协议。 |

## 已核对的关键决定

没有把已确认的娱乐局信任边界升级成防作弊要求。已确认房主/Agent 独立、Key 不上传、无钱包、手中资金操作、全员真人退出即关房、两种超时、场下观战及非阻塞教练均在方案中落实。单张牌面使用固定槽并由 app 映射到 UI，官网 Card[] 兼容也已补入当前草稿。

## 检查范围与限制

- 按模板先读主方案并复述，再核对继承聊天中的原始用户要求、product-decisions、tech-decisions、ADR-001 至 006 与方案附件。architecture.md 仅当历史背景，未当第二份实施契约。
- 核对基线 `55198ddaa9d2355cbd6530b87536a77ac828c652` 的规则开手/下注/边池、旧 runner 离桌/结算、Agent 调用超时、旧库结构、UI 类型与视图裁剪等实际源码。当前工作区未见业务实现改动，只有本需求文档。
- 查看了 runtime.png，结构与主方案的本地/远程运行分工一致。桌面在线箭头与文字相交是显示瑕疵，不影响理解，不作为阻断项。
- 本轮是静态技术方案审阅，没有启动新服务、执行新协议/恢复实现、打包、调用模型或做手机视觉操作验证；这些实现尚不存在，不能据此宣称运行通过。
- 审阅期间收到主代理说明的绑定确认、投影尺寸/归档分页、恢复 gate、存储类型归属与 UI 卡槽补充，已以磁盘更新后的内容核对。R1 仍保留：分页本身不等于完整历史同步契约。

## 第 2 轮增量复核

- 对象：`../plan.md` 草稿 r1 及三个文本附件，2026-11-02。
- 结论：**通过，首轮 R1–R4 均已关闭；本轮未发现剩余 P0。**
- 复核范围：只检查首轮四项修复与其波及的历史追赶、归档权限/分页、本地事务、开手生命周期、资金范围和公开/私有决策投影；没有将本次增量复核称为新的实现测试。

| 原编号 | 复核结果 | 核对依据 |
| --- | --- | --- |
| R1 | 已修复 | 协议“个人历史同步与稳定游标”定义了独立持久 archiveRevision/historyHead、PersonalHandRecord/RoomSummary/Change 和 ArchivePage；live 绑定可直接读取，closed 使用 archive.authenticate。固定 targetRevision 分页与 immutable change 分块处理避免分页期间的新变化混入；本地只在一条变化完整且连续时原子提交，失败不前移。资金确认、手结算、揭示、首次绑定、恢复和关房都触发比较 head，在线定期同步补通知。RoomStore 同事务写 personal_changes/head，HistoryStore 区分 current view 缓存与历史 cursor，late reveal 不重复计收益。离线跨手与大记录场景已有明确对接路径及后续验证要求。 |
| R2 | 已修复 | RoomState/RoomView 新增 started 与 waitingReason；存储附件明确展示结束先收尾 ghost、取回与 pending 转移，再按有效座位、成员资格、非暂离/ghost、stack>0 计算。人数不足进入 waiting，不调用 engine；首手失败不置 started，后续已 started 房间仅在 waiting 满足资格后自动开手。入座、资金、回归、移除和恢复 gate 解除后重新评估，pause/recovering/closed 阻止开手，最后真人离开优先 closed。主方案与界面等待入口已同步。 |
| R3 | 已修复 | 单笔 TransferAmount 限 1..10^9，累计 Chip 为非负安全整数，收益使用 SignedChip；raiseTo 用累计值且受合法范围校验。所有新余额/底池/累计值提交前检查，溢出拒绝 CHIP_LIMIT；状态与持久化不再沿用单笔上限。主方案添加两笔 10^9 累计余额专项验证。 |
| R4 | 已修复 | HandView.turn 使用 PublicTurnView 对所有接收者提供 seat、role、状态和公开时间；HandView.decision 使用 PrivateDecisionView 仅给 actor，非 actor 明确为 null。暂停时公开 deadline=null、remainingMs 保留，Agent 时间均 null；不再通过缺少必填私有字段的对象传递公开计时。主方案明确验证非 actor 原始消息的字段边界。 |

本轮没有拒绝项，也没有仍需用户裁决的审阅意见。方案仍是待用户评审的草稿，不因独立审阅通过自动变成定稿或取得实施授权。

### 范围与限制

本轮只读当前文档并静态走查修复路径，没有运行 WS、SQLite、迁移、Agent 或 UI 实现。资金与历史去重、waiting 自动恢复、公开计时权限等已写入实现验证门槛，实际通过与否须由后续执行证据证明。首轮完整审阅的范围和限制仍适用。

补充核对：第 2 轮结束前主代理补入类型归属及内部任务适配澄清，已检查 `assets/state-storage.md` 的对应定义。TableState 由 engine/state 声明，storage/room 只引用，FundingEntry 由 protocol/funds 声明，均不产生 engine→storage 或 protocol→storage 的反向依赖。内部 timer 的 receipt=null，按持久 timerId+generation 和阶段校验幂等，外部命令仍要求 CommandReceipt；未增加第三种玩家角色。此补充不改变上述通过结论，仍为静态契约核对。
