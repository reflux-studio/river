# task 审阅 · 第 4 轮

- **被审版本**：`.rivo/issues/unified-agent/task.md` 工作区快照（352 行），按 `reviews/task-3.md` 的 V-1..V-5 修订。
- **对照材料**：`plan.md`（同轮见 `reviews/plan-4.md`）、`discussion.md`、`reviews/task-3.md`，代码 `src/main/table/{text,runner}.ts`。
- **结论**：**通过**（阻塞 0，重要 0，建议 2）。前轮 5 条都已实质解决，跨任务没有新的矛盾。

## 前轮处理

| 编号 | 处理 | 结果 |
|---|---|---|
| V-1 对手视角的「你」 | T1 步骤 1 新增「对手视角的称呼」：`who()` 和 `logLines()` 在 seat ≠ 0 的视角下把座位 0 写作「玩家」；T1 验证加断言（如「玩家（枪口）」「玩家 跟注 100」）；T4 统一 `heroHandSummary` 行动行的称呼 | **解决** |
| V-2 新公屏被挤掉 | T3 第 180 行改为只取 `kind === 'msg'`、过滤后取 8 条；T3 验证加「A 的赛后发言出现在 B 下一手的观察里」；T4 写明讲解和提问都附新发言，`chatSeen` 在写入成功（含被打断）后推进；T4 验证加一条 | **解决** |
| V-3 「已出局」不可达 | 步骤和断言都已删除 | **解决** |
| V-4 U-5 的验证 | T4 验证加了「没有决策点时，复盘是第一组并带【往手回顾】，之后提问 messages 以它开头」 | **解决** |
| V-5 `chatSeen` 注释 | 改为「（对手、教练）」 | **解决** |

## 发现

### W-1（建议）T4 没写新发言放在教练观察的哪里，可能打乱 `lastSituation` 的比较

- **证据**：T4 规定 `thread.lastSituation = heroSituation(t)`，提问时用 `heroSituation(t) !== thread.lastSituation` 决定是否附局面。如果实施时通过 `situation()` 的 `o.chat` 把新发言拼进 `heroSituation` 里，局面文本就带上了公屏，每次比较都会不同。
- **后果**：提问时每次都会重复附上整段局面，浪费上下文，但不影响正确性。
- **建议**：写明新发言在 `heroSituation(t)` 之外单独拼接（例如放在局面之后、要求之前），`lastSituation` 只存不含公屏的局面文本。

### W-2（建议）T1 第 82 行「以上三项」计数已过时

- **证据**：步骤 1 删去「已出局」、加入「对手视角的称呼」后，依据对照表的条目已经不是三项。
- **建议**：改为「以上各项」。

## 跨任务一致性（无问题）

- 玩家的称呼：T1 的 `situation` / `logLines`、T3 的 `opponentSummary`、T4 的 `heroHandSummary`，以及现有的 `speaker()`，统一为「玩家」；只有观察者自己写「你」。
- 公屏规则：T3、T4 都是 `chatSeen` 之后只取 `kind === 'msg'`，过滤后取 8 条，只在成功写入后推进，与共同接口的注释一致。
- T1 的对手视角断言写在 `opponentAct` 替身的旧输入上；第 103 行已要求 T3 迁移为读最后一条 user 消息，覆盖这条新断言。
- rng 消耗变化、`holeAfter` 断言的范围限定、`setSummary` 的时机，与上一轮一致，没有被这次修订打乱。

## 检查限制

- 没有运行检查命令；没有重新核对 T5–T7（本轮未改动）。
