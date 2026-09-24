# T2 牌局引擎 证据

命令（项目根目录）：
- `pnpm test` → 1 个测试文件，16/16 通过，exit=0（test.log）
- `pnpm typecheck` → exit=0（typecheck.log）
- test/ 不在 tsconfig include 内，另用 `npx tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution Bundler --skipLibCheck --types node test/engine.test.ts` 检查，无错误

与原型对照（test/engine.test.ts「与原型对照」）：
- 原型经 `vm.createContext({ window: {}, rng })` 加载，上下文内 `Math.random = mulberry32(seed)`；移植版 `newGame(cfg, mulberry32(seed))`，两边同种子独立实例。
- 36 局、共 200 手，2–6 人，盲注 1/2、5/10、10/20，筹码 3–152 BB；每步 70% 用 decide、30% 随机动作（含非法 check/raise 与任意 to，覆盖纠正路径）。
- 每步比较：toAct、legal、decide 结果、apply 标签、board、log、每位在手玩家的 outs / handName / disp；每手结束比较 winners、showdown、全部筹码；开手比较底牌、dealer/sbI/bbI/toAct。
- 一次统计运行（临时计数，未保留）：1518 个行动步（1055 次 decide）、94 手摊牌、50 手摊牌含边池、24 手多位赢家、72 手出现全下。
- 变异检查（改后跑测再还原）：decide 系数 0.55→0.56、余数改给末位赢家、发牌 pop→shift、minRaise 更新条件改为 2 倍，均被测试捕获；`inc >= minRaise` 改 `>` 为等价变异，未捕获属正常。

## 第 2 轮收尾（审阅 reviews/T2-1.md 后）

- A1：poker.ts 改为 `import type { Card, Street } from '../../shared/types'`，删除本地定义；Legal、Profile 暂留引擎。
- T1：对照测试每一步（开手后、每个行动/发牌步后）比较去掉 `rng` 的 game 全对象（含 players 的 last、startStack、acted、contrib、score 等）。发牌前另断言：去掉 newGame 补的初值（sbI/bbI/deck/toAct/currentBet/minRaise/winners/showdown/runout、players[].startStack）后与原型相同。
  - 复测审阅中漏掉的两个变异：换街不清 `p.last`、startHand 不更新 `startStack`，现均被捕获（改后跑测再还原）。
- T2：tsconfig.node.json include 加入 `test/**/*`；typecheck 未暴露 test/db.test.ts 或其他错误。
- 命令与结果：
  - `pnpm test` → 2 个文件 31/31 通过，exit=0（test-r2.log，含 T3 的 db.test.ts）
  - `pnpm exec vitest run test/engine.test.ts` → 16/16 通过，exit=0（engine-r2.log）
  - `pnpm typecheck` → exit=0（typecheck-r2.log）
