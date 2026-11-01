# 实施验证记录

负责人：Codex 主代理。日期：2026-11-01。代码基线：2b7047c19465f5607be3695130a9cae999c9e623 加当前未提交实现。依据：plan.md v1.0、prd.md。没有提交、推送、打标签或发布。

## 自动化与构建

| 检查 | 实际命令与范围 | 结果 |
| --- | --- | --- |
| 桌面端完整测试 | apps/desktop 下 `node ../../node_modules/vitest/vitest.mjs run` | 15 文件、163 测试通过，日志 desktop-tests.log |
| engine | packages/engine 下同一 Vitest 入口 | 2 文件、36 测试通过 |
| UI | packages/ui 下同一 Vitest 入口 | 1 文件、5 测试通过 |
| i18n | packages/i18n 下同一 Vitest 入口 | 1 文件、4 测试通过 |
| 官网 | apps/site 下同一 Vitest 入口 | 1 文件、1 测试通过 |
| TypeScript | `node node_modules/typescript/bin/tsc --noEmit -p <项目>`：desktop node/web、engine 主/测试、ui、i18n | 全部通过 |
| 桌面构建 | apps/desktop 下 `node node_modules/electron-vite/bin/electron-vite.js build` | main/preload/renderer 构建通过；12 OGG 共 95,217 字节进入 renderer 本地资源 |
| 改动格式 | `git diff --check` | 通过 |
| 官网类型检查 | apps/site 下 `ASTRO_TELEMETRY_DISABLED=1 node node_modules/astro/bin/astro.mjs check` | 20 文件，0 errors / warnings / hints |

共 209 个测试通过。pnpm 在本机启动时触发自动依赖检查并试图访问网络，因此改用仓库现有 CLI 直接运行；没有安装新依赖。初次普通沙箱完整测试中的 3 个 resolve 集成测试因本机监听 EPERM 失败，不计通过；允许本机端口后全量重跑通过。

## TDD 与独立审阅

执行者分别记录牌局反馈、通知和播放器的红绿过程。主代理的 5 个同步控制器测试先全部因缺失行为失败，再实现通过。独立审阅发现旧设置 ACK 能回退新静音/音量，新增 2 条延迟响应回归先失败（true 被错误恢复、70 回退到 20），增加最新请求版本门控后通过。

逐任务报告见 ../reviews/T1-implementation-01.md 至 T4-implementation-01.md。审阅者的独立运行与本记录中的主代理自测分开表述；整体结论以最终整体报告为准。

## 界面核对

使用真实生产构建，先通过 ego-browser 的测试桥预览设置页，不连接个人数据库或模型。核对中文/英文声音文案、静音时试听禁用、音量 0 时试听禁用；浏览器未报告页面错误。截图见 ui-preview/settings-zh.png 。该桥不会证明真实 IPC 或系统通知。

## macOS Electron 本地运行

命令：仓库 Electron 44.4.5 执行 evidence/electron-smoke.cjs。使用生产 renderer 和 preload，隔离 userData=/tmp/river-audio-smoke-profile，IPC 由测试数据提供，不加载个人数据库、不调用模型、不发真实系统通知。

最终 electron-runtime/result.json 的 pass=true，进程退出 0：

- 12 条 file: OGG 请求全部 200，无音频外网请求。
- 可信鼠标输入触发试听，实际 AudioBufferSourceNode 在 running 的音频上下文中启动。
- 真实窗口最小化后发送测试过牌事件，声音 source 启动数从 1 增加到 3。
- 发送 All-in 后点击牌桌静音，soundEnabled=false，在播 source 被停止，后续排程没有继续启动。
- 通知点击的 renderer 页面事件能定位测试牌桌；Notification.isSupported=true 仅表示 API 支持，不证明系统弹窗出现。
- 页面没有报告错误，截图见 electron-runtime/settings.png 和 table.png 。

运行脚本第一版返回函数导致序列化失败，修正为无返回值。第二版用 PerformanceResourceTiming 统计 file: OGG 得到空列表，导致整体 pass=false，虽然播放及后台数据符合预期；保留 electron-runtime/result-attempt-02.json。最终改用 Electron webRequest.onCompleted 观测真实文件请求后重跑通过。前两次不作为产品通过证据。

一次复跑曾因自动审批服务额度不足而未执行；用户回复继续后同一操作正常获准并完成，没有绕过审批。

## 未覆盖与提测限制

没有完成 Windows/Linux 运行验证、安装包/ASAR 内资源检查、完整真人主观听感验收、真实系统通知的权限/勿扰/显示及点击验证。单元通知策略、API 支持或 renderer 模拟点击不能替代真实系统通知验收。当前完成开发自测，可交用户在真实牌局试听及测试，不宣称发布或端到端验收通过。
