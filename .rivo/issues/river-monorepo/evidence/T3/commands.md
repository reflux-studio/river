# T3 验证记录

| 命令（仓库根目录，除注明外） | 结果 |
|---|---|
| `pnpm install`、`pnpm --filter @river/ui add -D happy-dom @types/react-dom@^19.3.0` | lockfile 新增 importer `packages/ui`，desktop 新增 `'@river/ui': link:../../packages/ui`；新增外部包只有 happy-dom 及其依赖（仅 ui 的 devDependencies，用于 TableStage 渲染测试） |
| `pnpm typecheck` | exit 0；覆盖 engine、ui（`tsc -p tsconfig.json`）、desktop（node、web） |
| `pnpm test` | engine 36（原 35 + “摊牌时等于河牌圈最后动作”）；ui 4（新增 `test/table-stage.test.tsx`）；desktop 102。合计 142 |
| engine 用例 TDD | 先加用例，失败（摊牌时得到 `{}`）；`lastActs` 加一行 `if (street === 'showdown') street = 'river'` 后通过 |
| ui 用例反向验证 | 把 fx.ts 的加注条件临时换回旧正则 `/^(加注|下注)/.test(s.status)`：“加注特效三条件”“lastAct 非 bet/raise 或状态未变不播”两条失败；恢复后 4 条全部通过 |
| `pnpm build`（apps/desktop） | exit 0；`grep -c "@river/" out/main/index.js` = 0；renderer CSS 中含 ui 组件的类名（如 `bg-[oklch(0.58_0.15_250)]`、`h-[1.55em]`）和 tokens（`--topbar`），说明 `@source` 生效 |
| 主进程误引 ui 主入口（临时在 `src/main/table/view.ts` 加 `import { TableStage } from '@river/ui'`，`npx tsc --noEmit -p tsconfig.node.json`，试后已撤回） | 失败，见下 |

```
src/main/table/view.ts(6,10): error TS2305: Module '"@river/ui"' has no exported member 'TableStage'.
../../packages/ui/src/index.ts(3,15): error TS6142: Module './cards' was resolved to '.../packages/ui/src/cards.tsx', but '--jsx' is not set.
../../packages/ui/src/index.ts(4,15): error TS6142: Module './avatar' was resolved to '.../packages/ui/src/avatar.tsx', but '--jsx' is not set.
../../packages/ui/src/index.ts(5,15): error TS6142: Module './seat' was resolved to '.../packages/ui/src/seat.tsx', but '--jsx' is not set.
../../packages/ui/src/index.ts(7,15): error TS6142: Module './table-stage' was resolved to '.../packages/ui/src/table-stage.tsx', but '--jsx' is not set.
```

撤回后 `tsc -p tsconfig.node.json` exit 0。

## 边界检查

- `rg -n '\p{Han}' packages/ui/src -g '*.ts' -g '*.tsx'`：只命中注释。
- `rg "from '(@/|\.\./\.\.)|lib/river|window\.river" packages/ui`：没有结果。
- desktop main/shared/preload 中只有 `shared/types.ts` 引用 `@river/ui/types`。

## pnpm dev（未开牌局、未调用模型）

`cd apps/desktop && npx electron-vite dev --remoteDebuggingPort 9333`，用 `tools/cdp.mjs` 点击顶栏导航后截图（1440×900 @2x）：

- `lobby.png`：与 `T1/baseline/lobby.png` 逐项一致（最近手牌的 MiniCards、对手头像都正常），只有筹码数随数据变化（100,890 → 100,840）。
- `opponents.png`：头像（`Avatar`/`avatarBg` 来自 ui）正常。
- `settings.png`：牌桌色色块的 title 为本地映射的中文名，颜色取自 ui 的 `FELTS`（经典绿、深海蓝、酒红、石墨、素白）。

验证完成后已结束 dev 进程（9333 端口已关闭）。牌桌的实际特效和截图对比由主代理在用户同意后开局完成。
