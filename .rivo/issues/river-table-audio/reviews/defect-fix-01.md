# 首手发牌与开发通知缺陷修复：增量审阅

模式：本轮缺陷增量。依据：plan.md v1.1、task.md T6/T7、用户实测“首手只有声音没有发牌动画、发牌声音过快”与 `pnpm dev` 后台 `UNErrorDomain错误1`。代码：工作树 `/Users/suziming/Documents/personal/river`，基线 `2b7047c19465f5607be3695130a9cae999c9e623` 上的当前未提交修复。审阅者：独立子代理 review_audio_plan，未参与本轮实现。旧方案/整体审阅不用于证明本轮通过。

## 结论

通过。本轮增量未发现剩余 P0 或 P1。首手显式发牌、声音和视觉启动、共享节奏、发牌阶段操作门控以及通知准备/诊断入口的代码与已有证据符合 v1.1。

这是修复代码与现有证据的审阅通过，不代表已证明用户机器上真实 macOS 通知授权、开发 Electron 签名身份或横幅问题被根治，也不代表真人完整听感已验收。

## 问题

| 编号 | 级别 | 问题与后果 | 依据与位置 | 建议 |
| --- | --- | --- | --- | --- |
| — | — | 本轮未发现需修改的问题 | 以下检查范围与限制 | — |

## 跨模块检查

| 对象 | 核对结果 |
| --- | --- |
| DOM 提交与首手 | renderer 将实时 deal 存入状态，TableStage 接收显式 dealId，layout 阶段先安排牌张动画，再调用 onDealStart 消费同一事件并启动声音。不再从首挂载的快照差分猜测发牌；恢复/已消费为 null，页面往返不重播。 |
| 取消与备用路径 | 同桌/同手重新推视图不清理正在发牌的动画；新手/新 deal/fx off/真正卸载清理。页面在提交前离开时，renderer 消费待发 deal 走即时声音备用路径；不等待不存在的牌桌 DOM。音频仍有桌、手、代次、静音和过期过滤。 |
| StrictMode | 初版清理缺陷已有回归。最终代码通过 layout mount 代次及微任务区分同步模拟 cleanup/setup 和真正卸载：不重启消费回调、不在开发模拟清理后取消首手，真实卸载仍 cancel。独立 UI 测试覆盖该路径。 |
| 共享时序与发牌阶段 | 视觉与声音导入纯模块 @river/ui/deal-timing 的 170ms 间隔和 500ms 飞行。runner 由底牌数量计算 dealUntil，loop 的发牌门控位于 AI/教练/街推进前，heroCanAct 同时拒绝提前行动。timer 校验 runId、桌对象与 handNo，离桌/换手取消。 |
| ask 恢复 | 发牌期间提问会清除旧 stepTimer，回答后进入 loop 重新核对 dealUntil 并补剩余等待，不会绕过门控启动讲解或玩家操作；提问持续到发牌结束后则继续沿既有 ask 暂停/恢复路径处理。 |
| 通知初始化与权限表述 | 前台入桌调用 notification.prepare，设置页另有启用、测试与显式系统设置入口。prepare 仅说明 presenter 初始化，permission 始终 unknown；scheduled 只表示原生 show 回调，不宣称用户授权或横幅可见。开发 Electron 与安装版 River 的身份提示分开。 |
| 状态竞争及失败 | NotificationStatus 带递增 revision，设置页丢弃旧查询/请求响应；业务 failed 有可见提示并限制同一失败序列的全局提示次数。测试通知与决策隔离，5 秒超时、成功观察期及 dispose 清理有界，不消费牌局提醒或跳桌。系统设置仅在明确点击后打开固定 URI。 |

通知研究中的关键依据已独立浏览 [Electron 44.4.5 macOS presenter 源码](https://raw.githubusercontent.com/electron/electron/v44.4.5/shell/browser/notifications/mac/notification_presenter_mac.mm) 和 [Notification API 源码](https://raw.githubusercontent.com/electron/electron/v44.4.5/shell/browser/api/electron_api_notification.cc)：presenter 构造会异步请求原生授权，IsSupported 获取 presenter，而 Show 路径并不等待授权回调。因此前移 prepare 和保持 permission unknown 的做法与代码事实一致；这一静态核对不证明本机系统权限或开发签名行为。

## 独立验证

在 apps/desktop 执行：

```sh
node ../../node_modules/vitest/vitest.mjs run test/notifications.test.ts test/notifications-ipc.test.ts test/audio.test.ts test/river-deal.test.ts test/feedback-sync.test.ts test/river-settings.test.ts test/feedback.test.ts test/runner.test.ts test/english.test.ts
```

结果：9 个文件、94 个测试通过，退出码 0。覆盖通知状态/测试生命周期、IPC、音频序列与准备、DOM 发牌回调消费、页面备用路径、快照与 ACK 竞争，以及 runner 发牌 gate/ask/旧计时等回归。

在 packages/ui 执行 `node ../../node_modules/vitest/vitest.mjs run`：1 个文件、14 个测试通过，退出码 0，包含 StrictMode 首手保留/真实卸载清理、显式 null、回调替换及消费不取消、fx off、同手号换桌和官网自动模式。

合计独立运行 108 个本轮相关测试。另 `git diff --check` 通过。没有重放执行者的红阶段，没有修改实现代码。

## 执行者证据核对

- `evidence/defect-desktop-tests.log` 显示本轮最终完整桌面测试为 17 个文件、176 个测试通过；这是执行者完整测试证据，不是本审阅的全量重跑。协调者报告的类型检查及生产 build 未由本轮独立执行。
- 协调者最终另报告 UI 14、i18n 4、engine 36、site 1，与桌面合计 231 项通过，以及各包类型检查、sitecheck 20 文件零问题和桌面 build 通过；本审阅仅独立重跑了上列 108 项，未把整仓结果标为独立执行。
- 已读取 `evidence/defect-smoke.cjs`、`evidence/defect-runtime/result.json` 和 README。macOS Electron 44.4.5 使用本轮生产 renderer/preload，真实 Web Audio 与原生动画，测试 IPC 代替 runner/模型/数据库；最终 pass=true、errors=[]，12 条本地 OGG 请求均 200。
- 首手与第 2 手均记录 4 张底牌动画，delay=0/170/340/510ms、duration=500ms；首段声音与第一动画调用相差约 1.80ms 和 0.70ms。页面往返无重复发牌，静音手仍有动画且无声音，最小化仍启动两段 Check 声，点击静音后无后续 source 启动。
- 通知 failed 在脚本中明确注入，设置页存在失败说明、macOS 授权帮助和开发 Electron 身份提示，系统设置点击走测试 IPC。结果明示 realNotificationsShown=false、realNotificationPermissionVerified=false；没有用模拟失败反馈证明原生通知修好。

## 限制

没有独立启动 Electron、观察真人听感或操作用户系统通知权限。执行者的生产 smoke 不执行开发 StrictMode 双 effect；该行为由独立 UI 单测覆盖，不可称作已在 pnpm dev 实机复现通过。生产 smoke 也不运行真实 TableRunner，故完整牌局发牌阶段与 DOM 实际启动间跨进程时序仍由单元回归和隔离集成组合证明，不是完整付费模型牌局 E2E。

macOS 拒绝通知的具体授权/签名条件、授权横幅、真实通知展示及点击、勿扰、Windows/Linux、安装包/ASAR 和完整主观听感仍未验收。前台启用与系统允许需要用户真实环境确认；不能以 prepare、supported 或 scheduled 的状态标签替代原生权限结果。

本轮只新建此报告，保留旧审阅报告，未修改代码、方案或其他负责人的产物。
