# T7 验证记录（2026-09-24）

- `pnpm typecheck` 通过；`pnpm build` 通过；`pnpm test` 10 文件 111 用例通过。
- 运行：`RIVER_LIMIT_DECIDE_MS=1 electron-vite dev --remoteDebuggingPort 9337`，数据目录 River-dev；脚本 cdp.mjs（求值/截图/按键，经 CDP）与 play.mjs（真实按键打牌）。
- 本地引擎 6 人桌，play.mjs 用 C 跟注/过牌、N 与空格交替发下一手，打满 5 手：table-6p-1440.png、table-6p-result-1440.png。
- 座位布局：table-2p/3p/4p/5p-1280.png、table-6p-1440.png。
- 响应式：table-6p-880.png（<1280 默认收起，悬浮胶囊显示最近一条发言）、chat-expanded-880.png（展开 248px）、chat-collapsed-1440.png（用户收起后在 1440 下保持收起，localStorage river.chatShown=false）；880 与 1440 下 document scrollWidth == clientWidth。
- 托管与熔断：临时添加 openai-compatible 提供方 http://127.0.0.1:9/v1 作对手模型 → 座位“托管”标签 + “托管 · 跟注 100”、公屏行动带“托管”、横幅“对手模型连续失败，已托管 · 重试”：autopilot-breaker-1440.png（横幅后改为牌桌顶部通栏，见 pause-overlay-ask-1440.png）。
- 暂停遮罩：无模型时教练不会返回 pause；改用同一不可用提供方作教练模型，玩家回合点快捷问题（提问会暂停牌局）→ 操作区遮罩“教练暂停了牌局… / 我看完了，继续”、教练栏暂停条、失败回答“教练暂时没连上，稍后再问”：pause-overlay-ask-1440.png；点“我看完了，继续”遮罩消失。连续 3 次提问失败 → 教练熔断横幅：coach-breaker-1440.png；点“重试”两条横幅都消失。
- 输入框聚焦时按 F、C：字符进入输入框，牌局未行动。R：以默认加注额加注至 300。F（无需跟注时）按主进程规则转为过牌。
- 公屏：模拟 isComposing 的回车不发送；真实回车发送并清空输入。
- 硬核模式 + 进阶分析快捷问题：hard-pro-after-R-1440.png；人设点击循环（温和老师→直白教练）。
- 教学牌局提醒卡（hint 蓝底）与座位气泡：guided-hint-card-1280.png。
- 收尾：离桌、删除临时提供方、设置恢复为测试前值（engine llm、speed 1、coachOn、persona 0、novice、hard off、autoNext on、models {}）、清除 river.chatShown。余额因打牌由 99,790 变为 106,030（开发数据，未回滚）。
