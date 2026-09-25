# T1 验证记录

## 迁移后的检查（仓库根目录）

| 命令 | 结果 |
|---|---|
| `rm -rf node_modules && pnpm install` | 通过；lockfile 只改了 importers 部分（+13/−22），没有依赖版本变化 |
| `pnpm typecheck` | exit 0（apps/desktop：`tsc -p tsconfig.node.json` 和 `tsc -p tsconfig.web.json`） |
| `pnpm test` | 8 个文件、132 个用例全部通过（含 engine.test.ts 与原型的对照，读取 `../../../.rivo/...`） |
| `pnpm --filter ./apps/desktop exec pwd` | 解析到 `apps/desktop`（根目录 dev/dist 脚本用的就是这个 filter） |

tsc 和 vitest 只在根目录的 devDependencies 里声明，子包执行脚本时能找到，所以不需要在 desktop 再声明一次。

## pnpm dev

`cd apps/desktop && npx electron-vite dev --remoteDebuggingPort 9333`，然后用 CDP 读页面：`window.river` 为 object，大厅正常渲染，userData 为 `River-dev`（筹码 100,840）。截图：`dev-lobby.png`。

## 打包

```
cd apps/desktop
pnpm build                                          # exit 0
pnpm exec electron-builder --mac --publish never    # 产物：dist/River-0.2.1-arm64.{dmg,zip}，以及 blockmap、latest-mac.yml
```

- electron-builder 识别出 workspace 根目录：`detected workspace root ... pm=pnpm resolved=/Users/suziming/Documents/AI/river projectDir=.../apps/desktop`
- 警告 `cannot find path for dependency @ai-sdk/provider-v6@3.0.14` 和“平台可选依赖未打包”：**迁移前就有**。在临时 worktree 里用 4385728 执行同样的 build 加 `electron-builder --mac --dir` 对比，两边警告相同。
- 用 @electron/asar 列出迁移前后 app.asar 的文件：数量都是 13402，没有任何差异；`app.asar.unpacked`（@libsql/client、core、darwin-arm64、hrana-client、isomorphic-ws、libsql）也完全一致。**不需要改用 hoisted。**

### codesign -dv dist/mac-arm64/River.app

```
Executable=.../apps/desktop/dist/mac-arm64/River.app/Contents/MacOS/River
Identifier=app.river.desktop
Format=app bundle with Mach-O thin (arm64)
CodeDirectory v=20400 size=426 flags=0x2(adhoc) hashes=3+7 location=embedded
Signature=adhoc
Info.plist entries=32
TeamIdentifier=not set
Sealed Resources version=2 rules=13 files=142
Internal requirements count=0 size=12
```

## 打包后的应用

启动：`dist/mac-arm64/River.app/Contents/MacOS/River --remote-debugging-port=9334`，下面的命令都通过 `node tools/cdp.mjs 9334 eval ...` 执行。

| 检查 | 结果 |
|---|---|
| 页面 | `file:` 协议加载，`window.river` 为 object，大厅正常（`packaged-lobby.png`，筹码 99,730） |
| `app.bootstrap` | version 0.2.1、onboarded true、8 位对手、1 个 provider、speed 1，说明 libsql 能加载，river.db 能读 |
| `hands.list` / `hands.get` | 读到 7 手牌记录，能取出第一手的完整回放 |
| 写入 | `settings.update({speed:2})` 之后 river.db-wal 的 mtime 从 14:48:07 变成 14:48:19，重新 bootstrap 读到 speed=2；随后 `settings.update({speed:1})` 改回原值 |
| userData | `lsof` 显示进程打开的是 `~/Library/Application Support/River/river.db{,-wal,-shm}`；退出后 WAL 合并，river.db 的 mtime 变为 14:48:24 |

**没有打一手牌**：这台机器配置了真实的模型 provider，开桌就会调用模型产生费用，所以改为验证回放读取，加一次无害的设置写入并恢复。

所有 electron、vite 进程都已结束。
