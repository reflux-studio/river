# T9 证据：真实应用验收（2026-09-24）

真实 Electron 应用（`pnpm build` 产物）+ 本地 OpenAI 兼容假模型，经 Chrome DevTools Protocol 驱动。对手与教练都配置为 `http://127.0.0.1:8787/v1` 的 OpenAI 兼容提供方，走完整链路（Mastra → HTTP → 工具调用 / 流式）。

## 启动

```bash
cd .rivo/issues/river-v2/evidence/T9
PORT=8787 node mock-llm.mjs &
cd /home/user/river
xvfb-run -a -s "-screen 0 1600x1000x24" node_modules/.bin/electron . --no-sandbox --remote-debugging-port=9555 &
cd .rivo/issues/river-v2/evidence/T9 && OUT=<输出目录> node flow.mjs
```

## 结果（`flow.json`，截图在 `shots/`）

| 场景 | 截图 | 结果 |
| --- | --- | --- |
| 大厅 | 00 | 对局类型、预设桌、最近手牌 |
| 教练局 6 人：轮到玩家先锁定、教练讲解完解锁 | 01 | `busy: speak, locked: true` → 解锁 |
| 一手结束亮出全部底牌（含弃牌 mucked）、复盘前不能下一手 | 02 | `revealed: 6, mucked: 1, canNext: false` |
| 复盘卡 | 03 | 线程 `speak:done ×6, recap:done` |
| 提问暂停 | 04 | 回答期间 `busy: ask`，操作区“教练回答中，牌局暂停”，快捷问题与输入框置灰 |
| 模型 500：停下与重试 | 05 | `settings: false`，重试后继续 |
| 停下时离桌：本手作废 | — | 余额 89,330 → 100,330（= 本手开始时筹码 11,000 退回） |
| 教练局 3 人、对手全弃牌：一手结束亮弃牌 | 14 | `seats: 3, mucked: 2, revealed: 3`；概率面板固定在教练栏顶部 |
| 模型 401：停下横幅带「去设置」 | 16 | `settings: true`，存在「去设置」按钮 |
| 教练局手牌回放：亮出的弃牌、结构化复盘、花费 | 15 | 页面含“做得好”等三段 |
| 自由局单挑 | 06、07 | 没有教练（`coach: null`），摊牌只亮未弃牌者 |
| 桌面外观：换桌布 | 08 | 深海蓝 |
| 动效三档 | 08（完整）、17（精简）、18（关闭） | 三档各打一手，无报错 |
| 新建对手 | 09 | 编辑态 |
| 回放、统计（用量）、设置 | 10–13 | — |
| 渲染进程错误 | — | `errors: []` |

2、3、6 人桌均已覆盖（06、14、01）。
