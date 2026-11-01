# River 牌局音效与轮到你通知方案审阅

- 被审对象：`.rivo/issues/river-table-audio/plan.md`，草稿 v0.1，2026-11-01。
- 审阅者：独立子代理 review_audio_plan；未参与方案写作。
- 结论：不通过，存在 3 项 P0。

## 复述

本期在桌面端自由局、教练局和引导局中加入真实筹码、纸牌、弃牌和过牌声音，以用户选定的 Kenney Casino Audio 为主；木敲补充、合成短提醒、默认 true/50 及轻微获胜点缀作为方案建议待用户确认。TableRunner 在实际引擎动作后产生带桌、手和递增序号的声音事件，先推视图再推事件；renderer 全局 Web Audio 控制器播放本地资源，保持后台发声并支持静音、音量、去重和降级。主进程按决策点及窗口/页面状态发送无系统提示声的“轮到你”通知，点击后返回有效牌桌。自动化检查事件、播放器、设置与通知策略，实际 Electron 及各平台安装包再验证听感、后台时序和通知。不覆盖官网、历史回放、真人语音或发布 Release。

## 问题

| 编号 | 级别 | 位置 | 证据与后果 | 建议 |
| --- | --- | --- | --- | --- |
| R1 | P0 | plan.md 共用契约、F2 初始同步、F5 通知点击 | F2 要求“收到新桌视图后按 tableId 建立音频会话”，F5 要求 renderer 核对 tableId，但现有 `shared/types.ts:169` 的 TableView 不含 tableId，方案新增契约也没有为 table:view 补身份。FeedbackSnapshot 的身份只在 bootstrap 中出现，无法标识后续新桌视图。方案还要求把 bootstrap 暂存视图按到达顺序处理，却没有视图版本/快照边界：快照采集前已收到的较旧视图若在快照后重放，可把较新的快照回退；仅音频 seq 不能区分只更新教练/视图的推送。实施者必须自行补定跨模块协议，才能可靠关联声音、换桌与通知点击。 | 明确定义实时视图与 bootstrap 共用的桌身份和视图版本/水位契约，包括 null 离桌；在主进程同一无 await 区段采集一致的 view、身份及水位。定义 renderer 丢弃快照前暂存视图、保留快照后增量的算法，并据此核对反馈事件与通知点击。 |
| R2 | P0 | plan.md F1“玩家真正可操作”、F5 ReadyDecision | 方案在每次 broadcast 更新通知并用 canAct=true 发 turn，却没有规定如何避开现有就绪过渡。`runner.ts:225` 的 loop 会先 broadcast，随后第 238 行才进入 onHeroTurn；`locked():338` 在 heroKey=null 或尚不匹配当前日志位置时返回 false。于是教练局首次轮到玩家和新的决策点都可能在建立 heroKey、启动教练之前短暂呈现 `isTurn=true && !locked`，错误发出 turn/后台通知，并消耗本决策的一次提醒，真正解锁后无法再提醒。仅写“locked 时不发”不能覆盖这个已有调用顺序。 | 定义独立、完整的就绪谓词：基础行动条件成立，且教练局当前 heroKey 必须匹配决策身份、spokenKey 已完成当前决策、无问答锁定；或在任何对外 broadcast 前先建立并锁定新决策。视图、声音与通知采用同一稳定就绪语义。加入覆盖 loop 首次 broadcast 的测试。 |
| R3 | P0 | plan.md F2 AudioContext 初始化及未加载处理 | 方案首个手势才初始化/准备音频，同时规定不阻塞开桌、未加载声音只即时尝试且不等解码。冷启动立即开桌时，本地 fetch/decode 尚未完成而 table.start 已成功发出首手 deal/blind；控制器会按此规则丢掉它们，后续不补播。资源未失败时也会漏掉首手，与 PRD A4 的“新开桌首手实际发牌有声音”不一致，openingTable 只能解决页面订阅，不能解决素材未就绪。 | 明确冷启动的素材就绪策略：例如在初始化提前预解码，并允许新开桌实时事件在不超过 1 秒的窗口内有界等待所需音源，过期/静音/换桌立即取消；或开桌前只对有限时长的音频准备进行等待，超时降级并保留原因。不要让正常异步加载直接等同播放失败。补充延迟解码但最终成功的首手测试。 |

## 检查范围与限制

先只读方案进行复述，再核对 prd.md、product-decisions.md、tech-decisions.md、research/current-audio.md、research/audio-candidates.md、assets/sound-manifest.md 与解码 JSON；按 plan-reviewer、plan-structure 和 writing-clearly 规则审阅。另核对 TableRunner 的开桌/循环/教练/广播顺序、shared IPC 类型、renderer bootstrap/startTable 和 App 页面选择、主进程窗口生命周期及 engine 的行动/收注/摊牌接口。

核对了素材与许可证文件存在，以及解码记录中的大小、时长与限制声明；没有重新下载、试听、启动 Electron 或执行测试。解码实验是主代理提供的证据，不等同本审阅者独立运行或真实应用测试。默认值、木敲补充和短提醒等已清楚标为待用户确认，本报告没有把它们当作用户已批准，也不因其待集中确认而提出范围越权问题。后续文档现状更新已纳入一致性检查。

仅写入本报告，未修改方案、需求、代码或其他审阅产物。

## 第二轮增量复核

- 被审对象：plan.md 草稿 v0.2，2026-11-01，包含主代理补充的 TableView.hero.canAct 契约。
- 结论：通过。首轮 3 项 P0 均已在方案层关闭，无仍坚持的意见。

| 原编号 | 复核结果 | 依据与波及范围 |
| --- | --- | --- |
| R1 | 已关闭 | 共用契约增加 TableView.tableId、TableViewUpdate 及 Bootstrap.viewRevision；视图 revision 在 runner 生命周期内递增，涵盖换桌与 null 离桌。bootstrap 在全部异步读取后同步捕获 view、revision 和反馈水位，renderer 先应用快照再按原接收顺序重放、过滤 revision 与反馈 seq。此定义能区分快照前旧视图、快照后增量及跨桌音效，并支撑通知点击身份校验。方案同时登记生产者、监听、测试 harness 和 fixture 的适配及交错测试。 |
| R2 | 已关闭 | 严格就绪要求 heroKey 与当前日志位置匹配，教练局另要求 spokenKey 已完成当前 key 且 coachBusy=null，明确让 onHeroTurn 前的过渡广播为 false。新增 TableView.hero.canAct 供操作区使用，并由主进程 heroCanAct、反馈和通知共用；保留 isTurn 表示轮次归属，避免破坏教练等待及跳过入口。 |
| R3 | 已关闭 | 资源在应用 ready 后预加载，用户手势同步调用 resume，开桌前最多等待准备 500ms；正常准备完成再调用 table.start，超时或失败才按不可用降级。关闭音效/音量为 0 不等待，旧事件不补播。验证表补充 500ms 内延迟解码成功的首手与超时降级检查，覆盖首轮指出的正常异步加载竞争。 |

本轮只核对修订后的完整方案及以上修复波及的共用契约、F1/F2/F4/F5、通知点击和 UI 就绪语义；沿用首轮已核对的源码依据，没有重新调查无关素材或发布主题。结论仅是技术方案通过独立静态审阅，未代表方案已获用户批准、实施已授权，或代码、真实 Electron、听感及跨平台验证已通过。仅追加本报告，未修改方案或代码。
