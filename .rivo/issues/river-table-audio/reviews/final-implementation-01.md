# 牌局音效与轮到你通知整体：审阅

模式：整体。技术方案：plan.md 定稿 v1.0。代码：工作树 `/Users/suziming/Documents/personal/river`，基线 `2b7047c19465f5607be3695130a9cae999c9e623` 上本需求的当前未提交实现，包含 T4 设置 ACK 竞争修复。审阅者：独立子代理 review_audio_plan，未参与代码实现。

## 结论

通过。当前整体实现未发现剩余 P0 或 P1，先前 T4-R1 已通过增量复核关闭。这个结论是代码与现有证据的整体审阅通过，允许进入进一步提测；不是全部产品验收、真实系统通知或跨平台发行验证通过。

## 问题

| 编号 | 级别 | 问题与后果 | 依据与位置 | 建议 |
| --- | --- | --- | --- | --- |
| — | — | 本轮未发现剩余需修改的问题 | 以下整体检查及验证范围 | — |

## 整体检查

对照用户确认的真实牌桌音效、Kenney 主素材、后台保持声音及后台轮到玩家发通知，核对 PRD 与方案 F1–F5，而非仅累加逐任务结果。检查范围包含本需求所有修改和新增代码、测试、运行音源及来源文档；排除原有无关的 river-desktop/reviews/final-1.md 和依赖缓存。

| 检查对象 | 核对结果 |
| --- | --- |
| 实际事件与规则 | runner 从成功动作日志分类，包含连续过牌、All-in 跟注/短盲、公共牌、扣除未跟注返还后的收注、真实摊牌和单次派奖；多边池汇总并携带净收益。无效操作、重复广播与重试不伪造成功声。 |
| 就绪与去重 | isTurn 保留轮次语义，canAct 使用建立 heroKey 后的严格谓词；教练局等待 spokenKey 与当前决策一致且无忙碌状态。操作区、快捷键、声音与主进程通知输入遵循同一状态，问答恢复不重复提醒。 |
| IPC 与 bootstrap | 视图桌身份、跨桌不重置的 revision、同桌跨手递增的反馈 seq 配合；bootstrap 在异步读取后同步采集 view 与水位。renderer 先建快照基线再重放有序缓冲，处理旧视图、null 离桌、换桌、旧手及过期事件。 |
| 播放及生命周期 | 播放器全局存在，不因焦点或页面改变关闭。开桌手势 resume、资源准备最多等待 500ms，失败降级；新手/换桌/离桌/静音取消旧序列。4 source 上限、提醒优先、临时 duck、All-in 替代组合及净盈利点缀与映射一致。 |
| 设置 | true/50 默认、旧配置补缺/非法值归一化、写入校验及 kv 持久化路径完整；独立静音与音量、0% 与试听行为一致。最新请求版本过滤旧 ACK，避免拖音量后重新开启已静音的应用。 |
| 系统通知 | 主进程创建 silent 通知，以决策身份去重；窗口及 renderer 页面状态共同判断后台；锁定不发，失败隔离、陈旧桌点击校验及离桌/退出清理符合方案。设置静音不关闭通知。 |
| 素材和离线边界 | 12 个运行 OGG 与已核对 CC0 的原始文件一致，包含两份许可和来源说明；Vite 使用字面量本地 URL，桌面构建产物含 12 个 OGG。未把整包、骰子、试听站音频纳入运行资源。 |
| 结构与成本 | engine 与 @river/ui 未承担音频/通知职责，官网未引入播放器；声音控制、初始同步和系统通知分别封装为小模块，无新增音频依赖、数据库表、模型调用或运行时素材网络依赖。新增复杂度主要对应既定的去重、生命周期和初始同步要求。 |

## 实际验证

### 本审阅者独立运行或查看

1. `node ../../node_modules/vitest/vitest.mjs run test/river-settings.test.ts test/feedback-sync.test.ts test/audio.test.ts`，工作目录 apps/desktop：3 个文件、17 个测试通过。
2. `node ../../node_modules/vitest/vitest.mjs run test/feedback.test.ts test/runner.test.ts test/db.test.ts test/notifications.test.ts`：4 个文件、94 个测试通过。以上合计 111 项相关测试，涵盖 runner、设置存储、renderer 同步、播放策略与通知策略；测试依赖注入不等于真实系统通知。
3. 独立逐字节比较运行目录 12 个 OGG 与已下载素材包的对应文件，无差异；核对许可证和来源文件存在。检查构建目录包含 12 个 OGG。`git diff --check` 无输出，退出码 0。
4. 查看执行者的设置页截图及 `electron-runtime/table.png`，声音组、音量/试听及牌桌静音入口可见，无明显遮挡；没有独立交互操作这些页面。Electron 截图为 1280×800 窗口的 Retina 输出，不是另行创建的设计稿。

### 执行者提供、已核对的运行证据

- `evidence/desktop-tests.log` 显示最终桌面 15 个测试文件、163 个测试通过。其他包 engine 36、ui 5、i18n 4、site 1 合计 46 项和总计 209 项为协调者报告，未在本审阅再次执行。
- `evidence/electron-runtime/result.json` 显示 macOS Electron 44.4.5，生产 preload 与构建后的 renderer 通过 file: 加载，测试 IPC 数据、无用户数据库或付费模型。12 个 OGG 的 Electron webRequest 完成状态均为 200；试听 source 在 running context 启动；最小化后 Check 的 source starts 从 1 增至 3；静音后 starts 保持 5 且 stop 计数为 1，结果 pass=true、errors=[]。
- 已阅读 smoke 脚本，以上验证没有创建真实系统通知，JSON 明示 realNotificationsShown=false。notificationSupported=true 仅表示 API 支持，不证明通知展示、权限或点击成功。
- 此前通过 file: PerformanceResourceTiming 枚举素材的 instrumentation 检查失败，未计为产品通过；最终用 webRequest 观察实际加载的方式修正了检查。最初普通 sandbox 全测中的本机端口 EPERM 同样不计为测试通过，完整桌面通过依据为后续日志。
- 协调者报告最终 node/web typecheck 与 build 通过；本审阅未重跑这些命令，不把它们标为本审阅独立验证。执行者的红绿开发过程亦未独立重演。

## 适用限制

尚未验证真实系统通知的权限、展示、点击、通知中心清理和勿扰行为；Windows/Linux 安装包与 ASAR 内资源加载未由上述 macOS 非安装包 smoke 覆盖。完整自由局/教练局的主观听感、削波/刺耳、视觉同步和长时间后台节奏仍需真实验收；source.start 计数不能证明扬声器听感或完整牌局体验。

以上限制需随提测交付保留，不能据本报告宣称所有平台和用户验收完成。报告未批准发布、提交或推送代码。仅写入本报告，未修改实现或其他负责人的材料。
