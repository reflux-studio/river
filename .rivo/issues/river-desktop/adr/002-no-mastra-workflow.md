# 002：本期不使用 Mastra Workflow

状态：接受（用户委托 AI 决定，2026-09-23：“你来决定，我感觉 Workflow 和我们整个需求似乎都不太适配”）
日期：2026-09-23

## 背景与问题

用户希望 Mastra 用得完善，同时认为 Workflow 未必适合。需要判断 River 中是否有适合 Workflow 的环节。

## 可行选项

| 候选环节 | 用 Workflow 的做法 | 评估 |
| --- | --- | --- |
| 一手牌的主循环 | 每手一个 run，轮到玩家 suspend，行动后 resume | 每次行动写快照；教练随时暂停、离桌中止、过期结果丢弃都要映射到 suspend/cancel；实时交互下收益小于成本 |
| 赛后流程（落库→统计→更新印象→更新漏洞档案） | 固定步骤串联 | 落库与统计是几行同步代码；印象与漏洞由 agent 通过 working memory 工具在下次调用时自行更新，不需要额外 N 次调用 |
| 复盘 | 读记录→调用教练→存结果 | 单次 agent 调用即可 |
| 不使用 | TableRunner 驱动牌局；agent 自管记忆 | 结构最简单 |

## 决定与理由

本期不使用 Workflow。River 的核心是实时、可中断的交互循环，以及有自主性的 agent；没有“多步、可恢复、需要编排”的离线流程。

## 后果与重新考虑条件

放弃了在 Studio 中查看 workflow 运行轨迹；agent 调用仍可通过 Mastra 的 trace 观察。
重新考虑：出现批量离线任务时（例如“分析最近 100 手生成学习报告”、角色间多轮辩论生成赛后点评）再引入 Workflow。

## 依据

`discussion.md` §4、§5；Mastra 文档 `docs-workflows-overview.md`（1.69.0）。
