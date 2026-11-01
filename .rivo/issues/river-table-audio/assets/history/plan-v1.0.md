# River 牌局音效与轮到你通知技术方案

| 项目 | 内容 |
| --- | --- |
| 状态 | 定稿 v1.0，用户已确认并授权实施 |
| 负责人 | Codex |
| 日期 | 2026-11-01 |
| 代码基线 | 2b7047c19465f5607be3695130a9cae999c9e623 |
| 工作树 | /Users/suziming/Documents/personal/river |

| 相关文档 | 位置 |
| --- | --- |
| 产品需求与决定 | [prd.md](prd.md)、[product-decisions.md](product-decisions.md) |
| 技术讨论 | [tech-decisions.md](tech-decisions.md) |
| 调查与素材 | [现状](research/current-audio.md)、[素材核对](research/audio-candidates.md)、[素材映射](assets/sound-manifest.md) |
| 实验 | [浏览器解码记录](evidence/material-decode/browser-decode.json) |
| 独立审阅 | [plan-01.md](reviews/plan-01.md)，v0.2 复核通过，原 3 项 P0 已关闭 |

## 需求背景

为桌面端自由局、教练局和引导局补齐牌桌声音。牌局后台继续发声，后台轮到玩家时增加系统通知；教练局等玩家实际可操作后才提醒。官网自动演示、历史回放、背景音乐、真人报动作和教练朗读不进入首版。

用户于 2026-11-01 回复“可以，开始吧”，确认本方案并授权实施，包括默认开启及 50% 音量、简短获胜点缀、Kenney Impact Sounds 木质轻敲与合成短提醒。

## 需求总览

| ID | 模块 | 本期交付结果 | 涉及系统 |
| --- | --- | --- | --- |
| F1 | 牌局事件 | 实际动作可识别、可去重，初始快照不当成新事件 | engine 日志、TableRunner、共享 IPC |
| F2 | 声音播放与素材 | 本地真实牌桌声音，后台可用，支持混音、停播和失败降级 | 桌面 renderer、资源打包 |
| F3 | 声音设置 | 静音、音量、试听、持久化与旧设置兼容 | renderer、数据库设置、i18n |
| F4 | 回归与试听 | 行为测试、打包验证及实听证据 | 自动化测试、Electron 桌面应用 |
| F5 | 系统通知 | 后台就绪时通知一次，点击返回有效牌桌 | Electron 主进程、窗口与页面状态 |

## 整体设计

TableRunner 在引擎动作成功后生成不含牌面内容的语义事件，先推送最新视图，再发送声音事件。桌面 renderer 的全局播放层接收事件，使用本地 OGG 音源和 Web Audio 播放，生命周期独立于牌桌页面和视觉特效。主进程通知管理器同时接收当前决策点的就绪状态，结合窗口与页面状态发送系统通知。

engine 保持扑克规则职责，@river/ui 保持纯视觉组件，官网不引入播放器。所有新 IPC 类型在桌面 shared/types 中定义，沿现有 preload 的泛型 invoke/on 透传，不暴露 renderer 自由创建系统通知的接口。

### 共用契约

```ts
type FeedbackKind = 'deal' | 'board' | 'blind' | 'check' | 'fold' |
  'call' | 'bet' | 'raise' | 'allin' | 'collect' | 'showdown' | 'payout' | 'turn'

interface TableFeedback {
  tableId: string
  handNo: number
  seq: number                 // 同桌从 1 递增，跨手不重置
  at: number                  // 主进程 Date.now()
  kind: FeedbackKind
  seat?: number
  count?: number              // deal: 实际发出底牌张数；board: 新公共牌数
  heroNet?: number            // 仅 payout 使用
  decisionId?: string         // 仅 turn 使用
}

interface FeedbackSnapshot {
  tableId: string | null
  seq: number                 // bootstrap 的截止水位；无桌时为 0
}

interface TableViewUpdate {
  revision: number             // runner 生命周期内递增，换桌和 null 离桌不重置
  view: TableView | null
}

interface ReadyDecision {
  tableId: string
  decisionId: string           // tableId + handNo + 引擎 handLog 长度
  handNo: number
  canAct: boolean
}
```

新增 TableView.tableId:string，由 TableRunner.view 在组装引擎视图后附加。Events['table:view'] 从 TableView|null 改为 TableViewUpdate，Bootstrap 保留 view 字段并新增 viewRevision:number。每次对外视图推送递增 revision，离桌也发送 {revision,view:null}；该序号属于 runner 生命周期，换桌不重置，视图变化不依赖音效 seq。

新增 TableView.hero.canAct:boolean，使用 F1 的严格就绪谓词；hero.isTurn 继续表示轮次归属，供“教练正在看牌”等状态文案使用。ActionBar 的按钮与快捷键门控改用 canAct，主进程 heroCanAct 也采用同一谓词；不通过把 isTurn 置假来隐藏教练等待/跳过入口。

更新桌面所有视图事件生产者、renderer 监听、测试 harness 与 fixture；仍需 TableView 的上层组件继续接收解包后的 view。Bootstrap.view 的 tableId 与实时视图一致，@river/ui 的公共牌桌参数不增加业务身份。

新增 Events['table:feedback'] = TableFeedback，Bootstrap.feedback = FeedbackSnapshot。ReadyDecision 是主进程内部通知输入，不额外把手牌发送给通知管理器。新增 Commands['app.setTableVisible']：(visible: boolean) => void，Events['app:showTable']：{ tableId: string }，分别同步 renderer 是否展示牌桌，以及通知点击后的页面定位。

## 详细设计

### F1 牌局事件

生成器由 TableRunner 负责，保留单桌递增 seq、已处理日志游标和当前决策身份。每次引擎变更后的事件加入短暂待发批次，broadcast 先发送 table:view，再按顺序 flush 事件；重复 broadcast 不产生新动作声。通知状态在每次 broadcast 更新，不依赖声音开关。

| 入口 | 事件及去重依据 |
| --- | --- |
| startHand 成功 | 清空旧手音频代次；按新的手号产生 deal，底牌张数只计实际参与座位；读取新增 blind 日志 |
| 玩家或 AI actionTaken 成功 | 读取新增日志；allIn=true 时分类为 allin，替代普通 blind/call/bet/raise；check/fold 按实际结果分类 |
| endBettingRound 成功 | 变更前记录桌前下注额，减去新增 return 日志的返还后，仍有筹码实际归池才发一次 collect；board 长度增加发一次 board，count 为新增张数 |
| showdown 成功 | 实际多人亮牌时发 showdown，直接弃牌获胜不发；每手发一次 payout，带玩家 stack-startStack 的 heroNet；多边池合并 |
| 玩家真正可操作 | 当前决策首次 canAct=true 时发 turn；教练 locked、stalled、提问暂停、已结束或不轮到玩家时不发 |
| leave / 换桌 | 清除待发事件、当前决策与旧手定时器；table:view=null 使 renderer 停止所有牌局声音 |

All-in 的身份采用对应日志位置，不仅比较 allIn 布尔值。return 本身不触发普通下注或获胜声。教练局赛后补充公开所有底牌，不额外伪造 showdown。问答导致同一决策暂时锁定时保留 decisionId 和已提醒记录；动作改变日志位置后才产生新的决策身份。

反馈与通知共用严格就绪函数：存在活跃下注轮、轮到玩家、无 stalled，且 heroKey 已等于当前 handNo-handLog.length；教练局还要求 spokenKey 等于该 key 且 coachBusy=null。loop 在 onHeroTurn 建立新 key 前的过渡 broadcast 一律 canAct=false；onHeroTurn 建立 key 并更新教练状态后才可判定。不得只依赖 TableView.hero.isTurn 或旧 locked() 返回值。操作区是否解锁也使用同一就绪状态，避免声音、通知和按钮三者出现不同步的短暂窗口。

### F2 声音播放与素材

采用单个应用级 AudioContext，缓存解码后的 AudioBuffer，经主 GainNode 输出。应用 ready 后预加载本地资源，首个用户手势同步调用 resume。开桌操作在调用 table.start 前等待已启动的音频准备，最长 500ms；正常准备完成后才开始首手，避免冷启动时丢首声。失败或超时按声音暂不可用降级，仍开桌，旧事件不补播；音效关闭或音量为 0 不等待。采样资源由 Vite 静态 URL 导入，进入 out/renderer，由打包 files 规则纳入应用，运行时不请求外网。具体原文件及映射以素材映射附件为准。

播放控制器在应用初始化阶段订阅，页面切换不销毁。startTable 在调用 IPC 前设置 openingTable=true 并提前进入牌桌页（此时 view 可为空）；收到新桌视图后按 tableId 建立音频会话。开桌失败清理 pending 标志并回到原页，新的桌事件一律不借用旧桌状态。

bootstrap 阶段先订阅并按到达顺序暂存视图/音效推送。主进程在所有异步读取之后，同步捕获 view、viewRevision 和反馈水位，再返回快照；三者之间不插入 await，确保同一状态。renderer 先应用快照并建立 viewRevision，再重放暂存消息：视图只应用 revision>当前值的更新，包含 null 离桌；音频丢弃快照桌中 seq<=snapshot.seq 的事件，后续仅处理当前桌身份匹配且 seq 大于该桌游标的事件。换桌先从新视图建立 seq=0 的会话，再接收该桌增量；离桌终止声音会话。按同一接收顺序处理两类暂存消息，既不让快照前旧视图回退新状态，也不让快照后离桌被覆盖。

正常运行继续拒绝 revision<=当前值的视图及非当前桌音频。音频超过 1 秒则不播，但更新对应游标防重放；恢复快照不反推音效。音效不进入聊天历史或数据库。

会话初始化时只建立基线，不从已有 TableView 反推发牌。openingTable 的新桌事件属于实时开桌，不按恢复快照处理；声音可先于页面绘制短暂到达，但必须先有对应桌视图。数据按主进程同连接顺序发送，renderer 对无法匹配当前桌的事件直接丢弃。

声音不因失焦、最小化或页面切换停播。窗口 webPreferences 设置 backgroundThrottling=false，并以打包后的实际后台运行核对代价与时序；不让声音控制主进程的推进速度。

发牌序列按每张 85ms 间隔，公共牌按 130ms 间隔，桌面事件同时最多 4 个 source，超限先取消最旧的普通桌面 source，保留 turn 优先级。All-in 只调用加强筹码组合，不再调用普通行动音；collect/payout 每批各一次。turn 在普通桌面声冲突时短暂降低其增益。总线预留余量，具体增益在试听调整。

所有 source、延迟、代次均由播放控制器维护。新手、换桌、离桌和静音取消失效的 source 与排程，后台不取消。静音时仍推进事件游标；恢复、换语言或开关动画不重播。尚未加载的声音只尝试即时播放，不积压到解码完成后补播；初始化/解码失败捕获并限量日志，不弹连续 toast。AudioContext 被系统暂停后，在下一次用户手势尝试恢复，不回放暂停期间的旧事件。

### F3 声音设置

新增 Settings.soundEnabled:boolean 与 soundVolume:number，范围 0–100，建议默认 true/50。主进程和 renderer 初始值一致；读取旧配置缺字段时补默认值，非法存量回默认。settings.update 写入时拒绝非布尔开关、非有限数值与超出范围的音量。字段沿既有 kv Settings 保存，不新增数据库表。

设置页新增“声音”组：音效开关、0–100% 音量、试听按钮；牌桌右上角增加独立静音图标，aria-label/title 使用中英文词条，不放入视觉特效档位。试听播放一个短筹码声及操作提醒，遵守开关与音量。静音保留音量，音量 0 也无声；关闭或降至 0 立即停播。

系统轮到你通知遵守 F5，不因 soundEnabled=false 或 soundVolume=0 而关闭。声音设置仅控制应用音效。

### F4 回归与试听

| 层次 | 验证内容 |
| --- | --- |
| runner 行为测试 | 连续过牌、AI/玩家/快捷键相同行为、All-in 跟注与短盲、返还收注、跨街与边池、首手、故障重试、教练解锁/跳过/失败/问答、重复 broadcast 不重播 |
| renderer 控制器测试 | bootstrap 前后视图版本与 null 离桌交错、首手 opening 及延迟解码在 500ms 内成功、超时降级、跨桌 seq 重置、重复 seq、1 秒过期、静音取消/恢复、场景切换、4 source 上限、加载失败不排队 |
| 设置测试 | 缺字段旧数据、非法输入、持久化和中英文文案；typecheck 与桌面 test |
| 通知管理器测试 | 就绪和后台组合、同决策问答与反复失焦、离桌/换桌、重复点击、系统不支持/抛错、静音不关闭通知；用注入窗口与通知适配器测试策略 |
| 实际桌面运行 | 完整自由局与教练局，后台等待、最小化、通知点击和静音；核对声音及视觉时序 |
| 各平台打包验证 | macOS/Windows/Linux 本地资源离线加载、首声初始化、后台时序及系统通知；未测平台明确标记未验证 |

浏览器解码实验仅证明 12 个候选 OGG 在本机 ego Chromium 的解码可用，不能替代 Electron、实际听感或跨平台验证。

### F5 系统通知

主进程通知管理器接收 ReadyDecision。后台条件是窗口不可见、最小化、未获焦点，或 app.setTableVisible=false；是否发通知不影响 F2 播放。renderer ready 后同步实际页面，初始化未知时按未看牌桌处理，但无活跃 ReadyDecision 则不通知。窗口 focus/blur/minimize/restore/show/hide 及页面同步均触发重判。

同一 decisionId 首次 canAct=true 且后台时，检查 Notification.isSupported 后创建 title='River'、body 为当前语言“轮到你了”、silent=true 的通知。保留强引用并监听 failed；无论 show 成功与否，同决策都不在焦点变化时反复重试。canAct=false 时关闭旧通知，保留本决策已通知身份；新 decisionId、换桌、离桌时更新去重状态。就绪时在前台、之后切后台尚未行动，可首次通知。

点击时先恢复并聚焦当前窗口。只有 runner 当前 tableId 与通知记录一致且仍有活跃牌桌才发送 app:showTable；renderer 也核对 tableId 后 go('table')。旧通知不能操作牌局。每次更新清理旧引用与监听，应用退出时全部 close。

应用 whenReady 后设置 Windows AppUserModelId 为 app.river.desktop，与打包 appId 一致。macOS/Windows/Linux 分别验证安装包的系统通知；开发环境不承诺与正式安装包等效。系统拒绝权限或勿扰抑制展示时保留界面与声音，禁止要求牌局等待权限结果，不自动修改系统权限。

## 发布计划

1. 方案确认并取得实施授权后，依次完成 F1、F2/F3、F5，执行 F4。素材只复制实际选用的少量文件到运行目录，保留原名、两份许可证和来源说明；整包 ZIP 留在需求附件，不进入应用包。
2. 运行桌面 typecheck/test、全仓检查及桌面 build，确认官网无音频依赖变化。打包并验证 ASAR 内本地音源可加载，音频不依赖网络。
3. 对旧设置执行缺字段升级验证；不迁移历史牌局，不调用模型补音频数据。首次更新使用 true/50 建议默认值。
4. 在各可用平台记录离线播放、后台节奏、通知权限/点击、完整牌局试听证据；无法测试的平台列为发布限制。通知被系统抑制不算发放成功，测试策略通过也不算真实系统通知通过。
5. 本方案不包含打标签或发布 Release。回退可先关闭音效；代码回退到上一版本时新增 kv 字段由旧版默认字段筛选忽略，不改历史记录。系统通知问题可回退本次代码，不更改系统设置。

## 修订记录

| 版本 | 日期 | 改动与理由 | 关联决定 |
| --- | --- | --- | --- |
| v1.0 | 2026-11-01 | 用户确认审阅后的 v0.2 并授权开始开发 | 当前聊天“可以，开始吧” |
