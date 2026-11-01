# macOS 开发模式后台通知失败

负责人：Codex 通知执行者。日期：2026-11-01。
依据：用户在 `pnpm dev` 中观察到后台无通知，日志为 `turn notification failed 未能完成操作。(UNErrorDomain错误1。)`；工作树基线 `2b7047c19465f5607be3695130a9cae999c9e623` 上的未提交音效实现，Electron 安装版本 44.4.5。

## 结论

系统拒绝了原生通知排程。该错误不能独自区分“用户尚未决定/授权弹窗未完成”和“用户已经拒绝”，也不能证明安装版 River 的权限状态。此前应用在首次后台提醒时才初始化通知 presenter，立即排程；同时失败只写日志，界面无法帮助用户完成授权。这两个应用缺口已针对性修复。

不能将问题概括为业务代码完全没有请求权限：Electron 44.4.5 自身会异步请求 macOS 通知授权。它未向 JavaScript 暴露该异步请求的完成回调或原生授权状态。当前修复提前启动既有请求并提供可见的准备、测试与设置入口，不宣称能够绕过系统权限或保证每次显示横幅。

## 原始证据

| 来源 | 核对结果 | 含义 |
| --- | --- | --- |
| [Electron 44.4.5 NotificationPresenterMac](https://raw.githubusercontent.com/electron/electron/v44.4.5/shell/browser/notifications/mac/notification_presenter_mac.mm)，48–68 行 | 构造时调用 requestAuthorizationWithOptions(alert/sound/badge)，completionHandler 只记录授权结果 | Electron 已请求原生授权，但应用拿不到该回调 |
| [Electron 44.4.5 notification API](https://raw.githubusercontent.com/electron/electron/v44.4.5/shell/browser/api/electron_api_notification.cc)，273–309 行 | Show 直接交给原生对象；IsSupported 返回 presenter 是否存在 | 能力检测不是授权检测，show 不等待授权完成 |
| [Electron browser client](https://raw.githubusercontent.com/electron/electron/v44.4.5/shell/browser/electron_browser_client.cc)，1102–1105 行 | GetNotificationPresenter 惰性创建 presenter | 之前首次后台发送才首次触发原生授权，是可由源码确认的时序风险 |
| [Electron CocoaNotification](https://raw.githubusercontent.com/electron/electron/v44.4.5/shell/browser/notifications/mac/cocoa_notification.mm)，194–220 行 | addNotificationRequest 失败只把 localizedDescription 交给 failed；成功触发 displayed | 原生日志丢失了 NSError 结构，不能从通用描述获取准确授权枚举；show 事件只代表排程被接受 |
| [Apple notificationsNotAllowed](https://developer.apple.com/documentation/usernotifications/unerror/code/notificationsnotallowed)、本机 Xcode UNError.h | UNErrorCodeNotificationsNotAllowed = 1，应用未获准排程 | 对应用户的错误码，但不指明 notDetermined 或 denied |
| [Apple requestAuthorization](https://developer.apple.com/documentation/usernotifications/unusernotificationcenter/requestauthorization(options:completionhandler:))、本机 UNNotificationSettings.h | notDetermined 与 denied 是不同状态；首次请求可以弹系统授权，已拒绝后重复请求不会再次询问 | 已拒绝需要用户在系统设置修改；应用不能替用户改权限 |
| [Electron 44.4.5 notification 文档](https://raw.githubusercontent.com/electron/electron/v44.4.5/docs/api/notification.md) | macOS UNNotification 依赖应用签名 | 开发与正式安装身份须分开验证 |
| `codesign -dv --verbose=2 apps/desktop/node_modules/electron/dist/Electron.app`、开发 Electron Info.plist | 本机 Electron 为 adhoc/linker-signed，Info.plist not bound，无 TeamIdentifier；CFBundleIdentifier 为 com.github.Electron | `pnpm dev` 的通知身份属于开发 Electron，不是打包的 app.river.desktop。签名信息是环境事实，尚未单独证明它就是本次拒绝的唯一原因 |

Electron permission manager 在没有自定义 handler 时会默认允许 Chromium 的权限检查；其 Web Notification.permission 不能作为 macOS UNUserNotificationCenter 的授权状态。因此未使用 renderer 的 requestPermission 或 permission 值伪造原生授权结果。

## 修复

1. `notification.prepare` 显式初始化现有 Electron 通知能力，前移原生异步授权请求。返回 `permission: 'unknown'`，不把 supported/prepared 标成允许；前台开桌入口由主代理接入，设置页也提供“准备通知”。
2. `notification.status` 和 `notification:status` 暴露真实业务排程结果，附递增 revision，设置页不接受旧 IPC 回复覆盖新失败。原生 failed 保留错误，原生 show 清除旧错误但只报告 scheduled。
3. `notification.test` 发送与牌桌决策无关的静音测试通知，监听 show/failed，5 秒无结果则返回失败；成功后保留通知 10 秒供观察。不跳牌桌，不消费当前决策，不把是否出现横幅写成已知事实。
4. 设置页提供准备、测试与显式打开通知设置的按钮，并区分 macOS 尚未决定、此前拒绝后需设置，以及开发 Electron 和安装 River 的身份差异。业务通知失败同时可由主代理全局监听事件提示。
5. 系统设置仅在用户显式点击 `notification.openSettings` 后打开，不自动修改任何设置。macOS 目标 scheme 与通知扩展身份由本机 Apple System Settings.app 的 Info.plist 和 NotificationsSettings.appex 的 CFBundleIdentifier 核对；Windows 使用 [Microsoft 官方 ms-settings:notifications](https://learn.microsoft.com/en-us/windows/apps/develop/launch/launch-settings)。

没有增加原生依赖、Swift 子进程、私有 Electron 绑定或替换主进程通知架构。

## 验证与限制

新增目标测试先出现 4 个行为失败，随后实现通过；补充“测试通知不能刚排程就被关闭”的回归先失败后修复。最终 `notifications.test.ts` 和 `notifications-ipc.test.ts` 合计 15 测试通过；desktop node/web 类型检查通过。

测试通过注入的通知适配器验证状态、超时、取消、去重和 IPC，并未操作用户系统权限，也没有通过测试真实弹出授权窗口或观察系统横幅。本次没有读取 macOS 私有通知数据库。用户环境仍需在应用中完成系统授权并发送测试；若已拒绝或开发身份被系统限制，需要显式系统设置或对正确签名的 River 安装包分别验证。
