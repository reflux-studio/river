# River Web 与好友联机实施记录

依据：plan.md v2、产品决定与现有桌面设计体系。当前工作树未提交、未部署。

## 已实现

- 单个权威 RoomState，按房间串行处理操作；SQLite 同事务保存状态及必要回执，再推送各玩家可见视图。WS 与 Electron 本地连接使用同一运行时。
- 十人好友房、邀请链接、本地身份及个人战绩；买卖筹码、单张/双张亮牌、计时、掉线移除与房主转让、预约操作、暂停及公屏。
- Electron 使用原本地模型配置与 safeStorage，提供独立 AI 连接和私有教练。浏览器没有模型密钥入口。
- Web 与 Electron 共用 packages/app 页面。牌桌复用现有 TableStage、Seat、筹码、卡牌和动画；原桌面大厅布局、操作控件、公屏、分段控件、牌面文本和快捷键抽入 packages/ui，原页面与新联机页使用同一实现。继续使用原字体、tokens.css 与黑白灰界面。Electron 外观设置沿用现有 settings。

## 验证

2026-11-02 本机执行：

- pnpm typecheck：整个工作区通过，Astro 20 文件无错误、警告。
- pnpm test：引擎 40、i18n 4、共享 UI 15、站点 1、运行时/SQLite 12 项通过。桌面 3 项因沙箱禁止监听 127.0.0.1 而超时，原样在允许本地端口的环境重跑 pnpm --filter river test，181 项全部通过。
- 共享组件抽取后：pnpm --filter @river/ui test 为 17 项通过（新增单张亮牌槽位及操作栏禁用回归）；pnpm --filter river test 再次为 181 项通过。未修改原测试断言。
- Web、Electron、Server 与站点构建通过。Zod 构建有 PURE 注释位置警告，不影响产物。
- 真实 WebSocket 双客户端执行完整一手、资金与战绩、重连及关闭；Electron IPC 集成使用真实运行时与 SQLite，模型调用为 mock。
- Ego 浏览器验证共享界面：1440px 桌面牌桌、390px 手机牌桌、1024px 平板牌桌；手机和平板无横向溢出。验证公屏双端消息、管理面板与离房返回大厅。截图见 evidence/v2/ui-*.png；lobby 截图为 2279px 视口。

## 验证边界

未启动原生 Electron 窗口，未调用付费模型或验证真实 API Key，未做物理手机/平板触控验收。十人规则有运行时测试，截图为十个座位、两位真人的房间；未声称验证十个真人同时使用。没有上线或部署。

架构图已用 Ego 查看渲染；Archify 自动浏览器检查因 Chrome 管道权限失败，不计为自动检查通过。
