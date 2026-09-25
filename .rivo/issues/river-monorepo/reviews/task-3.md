# task / plan 复审（第 3 轮，聚焦 T2 审阅回填）

- **方式／审阅者**：独立聚焦复审，Claude（子代理，未派发下级代理，除本报告外未修改任何文件，未运行会调用模型的流程）
- **被审版本**：提交 aaf9846 相对 5d7f7a4 对 `plan.md`、`task.md` 的改动（`git diff 5d7f7a4 aaf9846 -- .rivo/issues/river-monorepo/plan.md .rivo/issues/river-monorepo/task.md`）
- **对照代码**：`packages/engine/src/last-acts.ts`、`packages/engine/src/table.ts`、`apps/desktop/src/main/table/view.ts`、`apps/desktop/src/renderer/src/components/table/useTableFx.ts`、`packages/engine/tsconfig.json`；依据 `reviews/T2-1.md` 的 F1/F3/F4

## 结论

**通过**。改动与 plan 契约一致，两条关于代码行为的说法经核实成立，没有引入矛盾。下面四条都是建议，不阻塞 T3；其中 R1、R2 建议在 T3/T8 开工前顺手改进文字。

## 核实

**1. “摊牌时传 `'river'` 等价于现有写法”：成立。**

```
endBettingRound()          live<=1 或 street==='river' → completed，不再推发牌记录
  └ 其他情况：street 前进 → log.push({street, board})   (table.ts:196-209)
showdown()                 live>1 时 street = 'showdown'   (table.ts:242)，不写任何记录
```

- `roundOfBetting() === 'showdown'` 只在未弃牌者多于 1 人时出现；这时下注轮必然走到了河牌（`endBettingRound` 在 live>1 时只在 river 结束），所以日志里一定有河牌的发牌记录，而且它就是 view.ts 里的 `lastBoard`。
- `lastBoard` 之后的记录全部带 `street: 'river'`：河牌圈动作，以及 `returnUncalled` 在切街前以当前街（river）写入的退回记录。两边都跳过 `return`；盲注只会出现在 preflop，此处不存在。因此 `lastActs(log, 'river')` 与“最后一条发牌记录之后”的座位范围完全一致。
- 全下后自动发完公共牌：river 发牌记录之后没有动作，两边都为空，也一致。
- 有人弃牌结束的一手：街不变（不会是 `'showdown'`），无需特判。
- T2 审阅的 15,920 点探针结果与上述推理吻合；本轮未重跑。

**2. “退回多余全下不影响特效”：成立。**

- `returnUncalled`（table.ts:406-415）在 `s.stack > 0` 时把 `allIn` 复位为 false，写入的 `return` 记录被 `lastActs` 跳过，所以该座位 `lastAct` 仍是 `'allin'`、`allin` 为 false，plan 的边界说明准确。
- 全下特效：`useTableFx.ts:145` 判断 `cur.allin[i] && !P.allin[i]`，只在由假变真时触发；复位是真→假，不会再触发，也不依赖 `lastAct`。
- 加注特效：新契约要求下注额增加 + `lastAct` 为 bet/raise + status 变化。退回发生在 `endBettingRound` 中，下注额只减不增，且 `lastAct` 为 `'allin'`，两个条件都不满足。
- 该残留 `'allin'` 只存活到本街结束：下一街按 street 过滤会清掉；河牌时会延续到摊牌（因为摊牌改查 river），但此时下注额已归零，不影响特效。

**3. T3 / T8 可执行性**：总体可执行，细节见 R2–R4。engine `src` 中没有 `console`、`setTimeout`、`process`、`Buffer`、`crypto` 等宿主 API（grep 为空），按 `lib: ["ES2022"]`、不带 Node 类型拆分 tsconfig 可直接通过。

## 发现

| 编号 | 类型 | 内容 | 位置 | 建议 |
|---|---|---|---|---|
| R1 | 建议（设计） | “摊牌改查 river”被写成调用方的约定，但 `lastActs` 有两个调用方（desktop `view.ts`、官网 `to-seat-view.ts`）。T3 写了特判，T8 的 `to-seat-view.ts` 条目没有提；只看 T8 的执行者容易漏掉。另外 `lastActs(log, 'showdown')` 永远返回空 Map，签名接受它却没有意义，容易误用。实际影响很小（摊牌时下注额为 0，加注特效本来就不会触发），但属于同一规则在两处重复 | plan.md engine 一节 lastActs 第二条；task.md T3 第 169 行、T8 第 483 行 | 首选：把规则收进共享函数，`lastActs` 内部把 `'showdown'` 视为 `'river'`（一行，`'showdown'` 街不会有动作记录，没有副作用），调用方直接传 `roundOfBetting()`，T3 的用例改为 engine 单测。次选：保持现状，在 T8 的 `to-seat-view.ts` 一条补上同样的特判和用例 |
| R2 | 建议（可执行性） | T8 的 F3 处理给了两种做法，其中“用 `astro check` 覆盖 engine 源码”未经验证：site 的 tsconfig 可能间接带入 Node 类型（Astro/Vite 的类型声明），不一定能发现 src 误用 Node API。T8 的验证标准也没有对应检查项。另外拆分后 engine 的 `typecheck` 脚本要改为检查两个 tsconfig，与 task 第 27 行“`packages/*` 的 typecheck 为 `tsc --noEmit -p tsconfig.json`”的约定需要一起调整 | task.md T8“另需处理”、第 27 行、T8 验证标准 | 只保留拆分 tsconfig 这一种做法；注明同时更新 engine 的 typecheck 脚本和第 27 行约定；在 T8 验证里加一条与 T3 相同形式的探针：在 engine src 临时写入 `Buffer` 或 `import 'node:fs'`，确认 typecheck 失败后撤回 |
| R3 | 建议（可执行性） | T3 要求“补一条用例：摊牌时 `lastAct` 等于河牌圈最后动作”，但没有说放在哪里。desktop 目前没有直接测试 `buildTableView` 的文件，它只经由 `runner.ts` 调用 | task.md T3 第 169 行；apps/desktop/test | 若采纳 R1，放在 engine 的 `last-acts.test.ts`；否则注明用 `runner.test.ts` 与 `table-helpers.ts` 的 harness 打到摊牌后断言推送的 `TableView` |
| R4 | 提示 | T3 真实开桌会调用用户配置的模型，产生费用。“一手约 ¥0.01”的来源没有写明；而且 T3 的特效检查项（全下、下注被退回、加注后直接赢下等）通常要打好几手才能都遇到，“至少一手”只够补上 T2 F4 | task.md T3 第 226 行 | 注明开局前由用户确认；把措辞改为“按单手约 ¥0.01 估算，打到检查项覆盖为止”，或写明哪些检查项可以用 mock 模型的测试代替 |

## 检查限制

- 等价性和特效结论来自代码阅读与 T2 审阅的探针数据，本轮没有重跑探针、typecheck 或测试。
- 没有启动 `pnpm dev`，也没有调用任何模型；R2 中 `astro check` 能否发现问题是推断，未实测（site 尚不存在）。
- “一手约 ¥0.01”未核实。
