# T4 renderer 与界面集成：审阅

模式：逐任务。技术方案：plan.md 定稿 v1.0。代码：工作树 `/Users/suziming/Documents/personal/river`，基线 `2b7047c19465f5607be3695130a9cae999c9e623` 上的当前未提交实现。审阅者：独立子代理 review_audio_plan，未参与 T4 编码。

## 结论

不通过，存在 1 项 P0：较旧设置响应可覆盖新的静音/音量意图，破坏即时声音设置。

## 问题

| 编号 | 级别 | 问题与后果 | 依据与位置 | 建议 |
| --- | --- | --- | --- | --- |
| T4-R1 | P0 | 拖动音量每个 onChange 都提交 settings.update；renderer 虽立即乐观更新，但每个请求返回的完整 Settings 都无条件覆盖当前状态。先提交音量调整 A，再立即静音 B：A 的响应仍含 soundEnabled=true，在 B 响应前会重新启用播放；普通拖动也会被较旧音量响应回拨。数据库串行写入只能保证最终持久化顺序，不能阻止 renderer 的中间旧响应回退，违反 PRD A7 与 F3 的立即停播/立即生效规则。 | `pages/Settings.tsx:374`；`lib/river.ts:165–168`；每次 setState 都调用 audio.configure。主进程 `db/index.ts:220–223` 每请求返回当时的 next 快照，因此该场景不需要主进程乱序响应即可发生。 | 为设置响应增加请求版本或逐字段待写版本，禁止旧 ACK 覆盖较新的用户意图；保留已有写失败语义。增加控制响应延迟的回归：先调音量再静音，先返回旧音量 ACK 时仍应静音；连续调音量时旧 ACK 不应回拨最新音量，最终保存值正确。 |

## 实际验证

读取 feedback-sync.ts、lib/river.ts、App.tsx、Table.tsx、Settings.tsx、ActionBar.tsx、i18n/dict.ts、tsconfig.node.json 及 feedback-sync 测试；并核对 settings.update 主进程返回快照与串行写入实现以确认 T4-R1 的具体竞争来源。

初始快照与暂存推送按视图 revision、当前桌身份和声音水位过滤；null 离桌与跨桌重置、旧手/过期事件、首手实时事件的模拟路径完整。音频层全局订阅，页面切换不停止；开桌有重入保护、提前设置 openingTable 并等待有限音频准备；通知点击只定位匹配桌，页面可见状态变化通过 app.setTableVisible 同步。ActionBar 按 canAct 门控且保留 isTurn 的教练等待入口。声音设置与牌桌静音存在中英文和可访问标签，试听遵守开关/0% 状态。

独立运行 `node ../../node_modules/vitest/vitest.mjs run test/audio.test.ts test/feedback-sync.test.ts`（工作目录 apps/desktop）：2 个文件、15 个测试通过，其中 feedback-sync 为 5 个。这些测试验证快照/事件纯逻辑，没有覆盖 lib/river.ts 的多请求设置响应竞争；该问题当前依据为明确的异步执行顺序静态推导，尚未运行带延迟桥接的 UI 复现。

未独立操作界面或检查 1280×800 截图。主代理正在做模拟桥浏览器 UI 核对，其尚未返回结果不作为本报告的验证证据。没有实际 Electron、真实系统通知或跨平台验证；主代理报告的 build/typecheck 也未在本轮独立重跑。其他并行任务的未完成和已报告环境限制未记为 T4 缺陷。仅写本报告，未改代码。

## 第二轮增量复核

结论：通过。T4-R1 已关闭，无仍坚持的意见。

`updateSettings` 在乐观更新前递增 settingsRevision，仅最后一次请求的 ACK 可覆盖 settings。较旧音量请求返回时不会恢复新静音意图，也不能回拨较新的音量；失败仍沿用原有提示与不回滚策略。新 `river-settings.test.ts` 两个用例实际导入 lib/river，控制不同请求的响应顺序并观察 audio.configure，覆盖音量后静音及逆序返回时的最终音量。

独立运行 `node ../../node_modules/vitest/vitest.mjs run test/river-settings.test.ts test/feedback-sync.test.ts test/audio.test.ts`：3 个文件、17 个测试通过。核对新增测试涉及的 tsconfig 模块包含调整，没有重放执行者的红阶段。此增量结论关闭设置 ACK 竞争，不扩展为界面视觉、持久化运行、真实音频或系统通知已通过。
