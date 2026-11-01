# 发牌与通知界面缺陷运行回归

执行者：implement_audio 子代理。日期：2026-11-01。结果：通过。

运行命令：`apps/desktop/node_modules/.bin/electron .rivo/issues/river-table-audio/evidence/defect-smoke.cjs`，按要求使用 require_escalated，退出码 0。使用 root 本轮构建的真实生产 preload 与 renderer（out/renderer/index.html 构建 mtime 1793522001），macOS、Electron 44.4.5。

## 实际结果

- 通过真实入座按钮启动测试 IPC 牌局，首挂载发牌产生 4 张底牌动画，delay 为 0/170/340/510ms，duration 均为 500ms。
- 首手 4 段滑牌声的 source.start 与动画调用均记录自同一 renderer 的 performance.now；首音与首动画调用差为 1.80ms，后续声音间隔约 172/169.3/169.7ms。
- 第 2 手仍产生同样 4 张动画及 4 段滑牌声，首音与首动画差为 0.70ms。
- 设置页与牌桌往返未增加发牌动画或声音；静音后第 3 手仍有 4 张动画、没有声音。
- 12 个生产 OGG file: 资源均经 webRequest 报告状态 200；没有把空的 performance 资源结果当作失败。
- 窗口最小化后模拟 Check，实际 AudioBufferSourceNode 启动两段敲桌声，context 状态均为 running。
- 实际点击静音后 source.stop 计数增加，之后无新声音启动；没有借助模拟音频 API 验证这一项。
- 模拟 notification:status 的 failed 事件后，设置页显示失败说明、macOS 授权说明、pnpm dev 对应 Electron 的身份提示；“打开通知设置”按钮走的是测试 IPC，不打开真实系统设置。
- 控制台产品错误列表为空。Electron 主进程打印一条 sandbox_extension_issue_file 资源警告，本轮未阻止运行或资源加载。

详细数据：[result.json](result.json)。截图：[首手发牌中](first-deal.png)、[通知失败状态](notification-failure.png)。执行者已查看两张截图，首张能看到在途底牌与禁用行动区的“发牌中…”，第二张可见红色失败提示及 Electron 开发身份说明。

## 边界

这是隔离运行回归，不是独立代码审阅。脚本使用真实生产 renderer/preload 与 Web Audio/原生动画，但以测试 IPC 提供牌桌视图和反馈，不读取用户数据库、不调用模型、不运行真实 TableRunner。`testBridge=true`、`realNotificationsShown=false`、`realNotificationPermissionVerified=false`。

未调用 Electron Notification.isSupported 或任何真实系统通知授权接口。失败状态是显式注入，只证明反馈界面与开关路径，不能证明真实系统权限、横幅或通知点击已通过。

生产构建不会执行开发 StrictMode 双 effect；本脚本未复现 pnpm dev 的该行为。也没有验证真人听感、Windows/Linux、fx=off 的声音场景，或完整 AI 牌局推进。旧 electron-smoke.cjs 与 electron-runtime 结果保持原样。
