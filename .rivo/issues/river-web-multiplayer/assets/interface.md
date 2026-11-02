# 共享界面约定 v2

Web 和 Electron 使用 packages/app 的同一 React 页面。界面只读取玩家 RoomView，操作经 Client 提交。

- 视觉与组件复用桌面端：tokens.css、TableStage、Seat、ActionControls、LobbyLayout/LobbyRow、ChatPanelLayout/ChatBubble、Segmented、RichText 及 useHotkeys。原桌面组件通过同一共享实现保持一致。
- 大厅提供昵称、房间容量、买入、盲注、计时和三个独立策略开关；可创建房间或粘贴邀请加入。
- 十个座位按 seatId 定位，本人转到下方；卡牌固定两个槽，未知牌用卡背。场下玩家有观战视图。
- 桌面牌桌与操作、公屏、教练并排；手机竖屏使用同一 TableStage，公屏、教练和管理可切换展开，操作区固定在底部。
- 只提供当前合法动作；未轮到时可预约 check/fold/checkOrFold。手后可亮任意一张或两张，不操作即不亮。
- 筹码输入独立于出牌；买入、卖出、待用筹码取回分别操作，不显示跨房间钱包。
- 房主可开始、暂停/恢复、跳过展示、散桌、转让、移除与授权 AI。Electron 能提供 AI 与私有教练；浏览器没有模型密钥输入。
- 历史按完整手牌和场次汇总展示；旧桌面历史保留在原回放/统计页，模型和角色设置继续复用原页面。

实际截图及检查边界见 implementation.md；没有经过真实硬件触摸验收时不宣称通过。
