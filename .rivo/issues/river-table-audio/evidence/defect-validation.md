# 首手发牌与开发通知修复回归

负责人：Codex 主代理。日期：2026-11-01。依据：用户本聊天的两项实测缺陷及开发方式 `pnpm dev`，plan.md v1.1、task T6/T7。当前代码仍为 main 工作区未提交改动，未发布。

## 修复与原因

首手动画在没有前帧时被跳过，独立音频流又先于 React 提交开始；开发 StrictMode 的模拟 cleanup 还会取消首手动画。现在用显式实时 dealId，在 layout 阶段启动视觉并回调播放声音，共用 170ms 逐张间隔与 500ms 单张飞行。StrictMode 模拟清理由挂载代次过滤，真实卸载仍清理，页面往返不重播。runner 等待实际发牌阶段结束后才推进 AI、讲解与玩家操作，提问恢复也不能绕过截止。

通知此前在首次后台发送时才初始化 Electron 原生 presenter；Electron 44.4.5 内部异步请求授权，但 show 不等待完成。错误 1 仅说明不获准排程，不能区分未完成授权、此前拒绝或开发身份限制。现在前台入桌先准备，设置页提供启用、测试与显式打开系统设置；状态、超时与失败可见，始终不把 supported/prepared/scheduled 当作真实权限已允许。开发说明指向 Electron，安装版为 River。根因证据见 ../research/notification-permission.md 。

## 自动化与类型检查

| 检查 | 实际结果 |
| --- | --- |
| 桌面完整测试 | 17 文件 176 项通过；日志 defect-desktop-tests.log |
| 共享 UI 完整测试 | 14 项通过，包含显式首挂载、重复/恢复抑制、fx=off、真实卸载与 StrictMode |
| i18n | 4 项通过 |
| engine | 36 项通过 |
| 官网 | 1 项通过 |
| TypeScript | desktop node/web、UI、i18n、engine 主/测试全部通过 |
| 官网 Astro 检查 | 20 文件，0 errors/warnings/hints |
| 桌面 production build | main/preload/renderer 均通过，12 OGG 本地资源 |

本轮合计 231 测试通过。新增行为先红后绿：首手音频过早、170ms 节奏、共享UI首手、StrictMode动画被取消、runner截止前AI已开始、通知初始化/状态/失败测试。旧测试仅补上新发牌阶段的前置等待，保留原行为断言。

## 实际 Electron 回归

执行者 implement_audio，主代理已读取结果与截图。详细见 [defect-runtime/README.md](defect-runtime/README.md)、[result.json](defect-runtime/result.json)，脚本 defect-smoke.cjs，macOS Electron 44.4.5 真实生产 renderer/preload，退出 0，pass=true。

真实入座按钮后，首手 4 张视觉延迟为 0/170/340/510ms、飞行500ms，实际 4 段滑牌声音；首音与首动画调用差 1.80ms。第2手一致，启动差0.70ms。页面往返不重播；静音后4张动画无声音；12 file: OGG 全200，最小化过牌与立即静音通过。失败通知的模拟事件正确显示授权说明、Electron身份及系统设置按钮。

该运行以测试 IPC 提供视图和反馈，不连接个人数据库或模型，不运行真实 runner，不调用系统通知授权或横幅。生产构建的运行不覆盖开发 StrictMode，后者由实际 StrictMode wrapper 单测覆盖。source.start 时序也不等于真人听感验收。

## 接续复测

重启开发应用，先在设置 → 声音 → 后台提醒点击“启用通知”，回应系统提示后发送测试。如已拒绝或没有提示，点击“打开通知设置”，在开发环境检查 Electron 的通知权限；安装版应检查 River。测试状态只是系统接受排程，不保证勿扰/提醒样式允许横幅。真实系统授权、横幅与点击仍需用户环境验证，不能据模拟测试声称已通过。

本轮独立审阅结果另见 ../reviews/defect-fix-01.md，不沿用上一轮整体报告覆盖新改动。
