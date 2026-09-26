# T2 验证记录

| 命令（仓库根目录，除注明外） | 结果 |
|---|---|
| `pnpm install` | lockfile 只新增 importer `packages/engine: {}` 和 desktop 的 `'@river/engine': link:../../packages/engine` |
| `pnpm typecheck` | exit 0；`pnpm -r` 覆盖 packages/engine（`tsc -p tsconfig.json`）和 apps/desktop（node、web 两个 tsconfig） |
| `npx tsc --noEmit -p tsconfig.node.json --listFiles`（apps/desktop；web 同） | 列出 `packages/engine/src/*.ts` 共 6 个文件，desktop 的 typecheck 会跟随 import 检查 engine 源码；tsconfig 不需要改 |
| `pnpm test` | engine：2 个文件、35 个用例（原 31 + lastActs 4）；desktop：8 个文件、102 个用例。合计 137 = T1 的 132 − 原 engine.test 的 37 + 31 + 4 + desktop text.test 的 7（6 个 text 用例 + 拆出的 disp 对照） |
| `pnpm build`（apps/desktop） | exit 0 |
| `grep -c "@river/engine" out/main/index.js` | 0（engine 已打进 bundle，`electron.vite.config.ts` 未改） |
| lastActs TDD | 先放空实现（返回空 Map），4 个用例全部失败；实现后通过 |

## pnpm dev

`cd apps/desktop && npx electron-vite dev --remoteDebuggingPort 9333`，用 `evidence/tools/cdp.mjs` 读页面：`window.river` 为 object，大厅正常渲染（筹码 100,840、对手列表齐全），截图 `dev-lobby.png`。未开牌局、未调用模型。验证后已结束进程。
