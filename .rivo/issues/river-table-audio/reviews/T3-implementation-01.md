# T3 后台通知：审阅

模式：逐任务。技术方案：plan.md 定稿 v1.0。代码：工作树 `/Users/suziming/Documents/personal/river`，基线 `2b7047c19465f5607be3695130a9cae999c9e623` 上的当前未提交实现。审阅者：独立子代理 review_audio_plan，未参与 T3 编码。

## 结论

通过。当前 T3 范围未发现 P0 或 P1。结论覆盖通知管理策略、Electron 窗口适配及对应模拟测试，不代表真实系统通知、通知权限、各平台安装包或整体集成已通过。

## 问题

| 编号 | 级别 | 问题与后果 | 依据与位置 | 建议 |
| --- | --- | --- | --- | --- |
| — | — | 本轮未发现需修改的问题 | 本任务范围见下文 | — |

## 实际验证

独立读取 `main/notifications.ts`、`main/index.ts` 与 `test/notifications.test.ts`，对照 task.md T3 和 plan.md F5。结合 shared ReadyDecision、app.setTableVisible/app:showTable 契约、runner.readyDecision/onDecision 的输入与离桌置空行为检查，不将并行任务尚未完成的 renderer、音频或整体集成认作 T3 缺陷。

实际核对的代表性路径：

- 看着牌桌时不通知；窗口失焦、隐藏、最小化或应用在其他页面时可以通知，且不以声音设置作为条件。
- canAct=false 不通知；同决策的问答锁定会关闭在播通知但保留已尝试身份，恢复及反复切焦点不重复；新决策可再通知。
- 不支持通知、创建或 show 抛错、原生 failed 均不会向 runner 抛出；同决策不反复尝试，活动通知与监听按身份变更、离桌、退出清理。
- 点击恢复最小化窗口、show/focus，当前桌身份匹配才发送页面定位事件；对保存的陈旧桌回调再次调用也不能跳回旧桌。dispose 后不再创建通知。
- 主进程设置 silent=true、Windows AppUserModelId 与打包 appId 一致；窗口六类状态变化触发 refresh，backgroundThrottling=false；原有异步离桌退出守卫不会被移除。

独立运行：在 `apps/desktop` 执行 `node ../../node_modules/vitest/vitest.mjs run test/notifications.test.ts`，**1 个测试文件、9 个测试通过**。这些用例通过注入窗口与通知适配器检查策略，不会弹出真实系统通知。

最初尝试 `pnpm --filter ./apps/desktop exec vitest run test/notifications.test.ts` 被当前 pnpm 自动依赖检查触发的网络访问及非 TTY 安装检查中止；该命令不是测试通过证据。随后使用已安装的 Vitest 入口完成上述独立运行，未安装或更新依赖。

执行者报告过先红后绿及局部类型检查；本审阅未重放其开发时序，也未独立运行类型检查，不据此宣称完整 typecheck 通过。没有启动 Electron 或实际触发系统通知，没有验证 macOS/Windows/Linux 原生权限、勿扰、通知中心保留/清理和点击行为；这些保留到 T5 的真实运行与平台验证。仅写入本报告，没有修改实现代码。
