# 牌局音效：实施安排

依据：plan.md v1.0、prd.md 验收标准。用户 2026-11-01 回复“可以，开始吧”，已授权实施；不包含提交、推送、打标签或发布。
当前协调者：Codex 主代理。工作树：/Users/suziming/Documents/personal/river，起点 2b7047c19465f5607be3695130a9cae999c9e623，保留既有未跟踪 river-desktop/reviews/final-1.md。

## 共同约定

契约以 plan.md 为准。行为实现遵循 TDD；子任务不自行更改共享契约。各执行者仅修改分配路径，跨路径需要主代理整合。牌桌样式沿用当前组件与 1280×800 窗口，无外部设计稿。逐任务审阅与整体审阅均由未参与相应代码实现者进行，不把单元模拟当作系统通知或听感验收。

## 任务

| 任务 | 模块与验收 | 结果 | 依赖 | 负责人/范围 | 当前进展 |
| --- | --- | --- | --- | --- | --- |
| T1 牌局契约与反馈 | F1、F3；A1–A6、A7、A8 | 语义事件、严格就绪、视图水位、设置校验与 bootstrap 快照 | 无 | 后端执行者：shared/types、main/table、main/db、main/ipc、现有后端测试与 harness | 完成；逐任务审阅通过，见 reviews/T1-implementation-01.md |
| T2 本地播放器 | F2；A1–A4、A6、A8–A11 | Web Audio 播放、素材、静音/并发/清理、500ms 准备 | 方案契约 | 音频执行者：renderer/src/lib/audio*、renderer/src/assets/sounds、test/audio* | 完成；逐任务审阅通过，见 reviews/T2-implementation-01.md |
| T3 后台通知 | F5；A5、A9、A12 | 通知管理器、窗口生命周期、后台节流与通知点击 | 方案契约 | 通知执行者：main/index、main/notifications、test/notifications* | 完成；逐任务审阅通过，见 reviews/T3-implementation-01.md |
| T4 renderer 与界面集成 | F1–F3、F5；A7–A9、A12 | 快照重放、开桌准备、设置/静音界面、中英文、canAct 门控 | T1–T3 接口 | 主代理：renderer/src/lib/river、App、Table、Settings、ActionBar、i18n、test/feedback-sync* | 完成；设置旧ACK回退已修复，复核通过，见 reviews/T4-implementation-01.md |
| T5 整体验证与独立审阅 | F4；全部验收 | typecheck/test/build、可用平台运行核对、报告与修复 | T1–T4 | 主代理协调，独立审阅者 | 开发验证与整体审阅完成；真实系统通知、完整听感及跨平台打包列为提测限制 |
| T6 首手发牌回归修复 | F1/F2；用户本轮缺陷、A4/A8 | 实时deal驱动首手动画，视觉与声音同步170ms，牌局等待发牌结束 | 用户实测反馈 | 主代理、共享UI/runner执行者 | 完成，含StrictMode回归；本轮独立审阅通过，见 reviews/defect-fix-01.md |
| T7 开发模式通知回归修复 | F5；用户本轮UNErrorDomain1反馈 | 前台准备、测试与错误状态、系统设置入口，区分Electron身份 | 用户确认pnpm dev | 通知执行者 | 代码、模拟回归、UI运行及独立审阅完成；真实授权/横幅待用户环境复测 |

## 验收与当前结果

代码已实现，保留在当前 main 工作区未提交。所有逐任务及整体独立审阅通过，无剩余 P0/P1；[整体报告](reviews/final-implementation-01.md)。主代理完整验证与局限见 [validation.md](evidence/validation.md)：209 测试、各包类型检查与桌面构建通过，macOS Electron 本地加载/最小化播放/静音实测通过。通知策略有独立模拟测试，真实系统通知、Windows/Linux、ASAR 和完整主观听感仍需接续验收。未自动启动专业测试工作流、未发布。

局部实现选择：设置返回加最新请求门控，避免旧音量 ACK 重新开启静音；node tsconfig 显式纳入开发测试导入的 renderer 纯模块；复用现有依赖直接运行 CLI，清理自动依赖检查生成的 .pnpm-store 临时空缓存。没有改变已确认功能范围。

用户本轮反馈后的当前结果以 [defect-validation.md](evidence/defect-validation.md) 为准：231 测试及本轮独立审阅通过，真实生产 renderer/preload 的首手/第二手音画同步运行通过；pnpm dev 的 StrictMode 用专项单测核对。已新增通知启用/测试/设置入口，但未代用户操作系统授权，也未把模拟状态当作真实横幅成功。
