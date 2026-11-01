# 发牌声与设置页二次修正（2026-11-01）

执行者：ZCode。生产构建 + 测试 IPC 牌桌视图，不读用户数据库、不调用模型。

## 发牌声

用户在真实牌局反馈“音效和发牌张数对不上，发牌完了还会有一声”。复现方式：6 人桌跑真实渲染进程，记录
`Element.prototype.animate`（只筛发牌关键帧）与 `AudioBufferSourceNode.start` 的 `performance.now()`。

| 场景 | 动画数 | 首声相对首动画 | 结论 |
| --- | --- | --- | --- |
| 开发渲染器 6 人桌 | 12 | +2.6ms | 张数与时间轴对齐 |
| 生产构建 6 人桌 | 12 | +1.7ms | 同上 |

张数没算错。真正的原因是**样本自带的静音**：解码后逐样本测起音位置（阈值 0.02），

| 样本 | 起音 | 峰值 |
| --- | --- | --- |
| card-slide-1 | 135.8ms | 155.9ms |
| card-place-1 | 100.0ms | 159.2ms |
| card-place-2 | 43.1ms | 198.3ms |
| card-shove-1 | 84.1ms | 120.4ms |
| chip-lay-1 / 2 | 47.4 / 79.4ms | 49.1 / 82.6ms |

`card-slide` 开头的 131ms 静音让“把偏移调成 0”也依然晚一截。修复：

- `scripts/audio-onsets.cjs` 一次性算出每个样本的起音位置，常量写在 `lib/audio.ts` 的 `onsets`；
  播放时用 `start(0, onset)` 跳过开头静音。运行时不再扫描波形。
- 素材替换或重新压制后跑 `pnpm --filter river audio:onsets`，把输出填回常量。
- `DEAL_SOUND_OFFSET_MS` 保留为微调项，默认 0（起音与起飞同时）。
- 6 人桌实测声音起点为动画起点 +2.2 / +173.2 / +344.5ms，与 170ms 逐张节奏一致。
- 发牌声仍是独立 session，在最后一张起飞后 260ms 收尾。

## 牌堆与逐张发牌事件

- `packages/engine/src/deck.ts`：`Deck` 负责洗牌、切牌、逐张取牌；`deal()` 仍从尾部取，发牌顺序与改造前完全一致（引擎测试未改断言）。
- `Table.dealEvents()` 按实际发生顺序记录底牌、烧牌、公共牌事件（`seq / street / round / seat / board / burn`），不带牌面。
- `TableFeedback.cards` 下发底牌顺序；UI 的 `dealCards` 按事件顺序找座位与圈次，声音张数等于实际动画张数。
- 官网没有事件时仍按 DOM 圈次推断，行为不变。

## 设置页

同一块「声音」里：开关、音量、试听合并；后台提醒改成开关，状态收成一行，按钮换成文本链接。
不写开发版/安装版之类的环境自述。截图：[before.png](before.png)、[after.png](after.png)、[failed.png](failed.png)。

失败态只有「系统未允许通知 · 发送测试 · 打开系统设置」这一行，`NotificationStatus.development` 字段一并删除。

## macOS 开发版通知

本机 `node_modules` 里的 `Electron.app` 为 linker-signed ad-hoc（`flags=0x20002`），UNNotification 不接受，
所以报 `UNErrorDomain 1` 且不出现在系统设置。打包产物为普通 ad-hoc（`flags=0x2`、`app.river.desktop`、`River`），
走安装包验证即可；本机 `apps/desktop/dist/mac-arm64/River.app` 的签名与 Info.plist 已核对。
