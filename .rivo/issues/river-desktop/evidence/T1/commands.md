# T1 证据：命令与关键输出

环境：macOS 27.0 arm64，Node 24.19.0，pnpm 11.22.0，Electron 44.4.5，electron-vite 5.0.0，electron-builder 26.15.3。

| 步骤 | 命令 | 结果 | 文件 |
| --- | --- | --- | --- |
| 类型检查 | `pnpm typecheck` | 通过 | - |
| 开发运行 | `RIVER_SPIKE=1 pnpm dev` | 窗口打开（renderer 进程存在），9 项断言全过 | dev-spike.log、spike-result-dev.json |
| 打包 v0.1.0 | `pnpm dist` → `dist/River-0.1.0-arm64.dmg`；dmg 挂载后 `ditto` 到 `~/Applications/River-spike/`，`River.app/Contents/MacOS/River --spike` | pass，safeStorage mode=encrypt，river.db 含 44 张 mastra_ 表 | packaged-v0.1.0.txt、spike-result-packaged-v0.1.0.json |
| 改版本重打包覆盖 | version→0.1.1，`pnpm dist`，同样覆盖安装并启动 | pass，safeStorage mode=decrypt ok=true | packaged-v0.1.1-overwrite.txt、spike-result-packaged-v0.1.1.json |

## 已排除的环境问题：pnpm hoisted 布局导致打包缺依赖

`nodeLinker: hoisted` 下打包的 v0.1.0 启动即弹出主进程错误框（`sample` 显示主线程停在 `-[NSAlert runModal]`），userData 未创建。解包 app.asar 后在 Node 中 `import('@mastra/core/agent')`：

```
node_modules/@ai-sdk/provider-utils-v7/dist/index.js:3273
SyntaxError: The requested module '@ai-sdk/provider' does not provide an export named 'NoSuchProviderReferenceError'
```

原因：electron-builder 26 的 pnpm 收集器依据 `pnpm list --json` 的路径，hoisted 下该输出仍给出 `node_modules/.pnpm/...` 虚拟仓库路径（实际不存在），别名依赖（`@ai-sdk/provider-v6` = `@ai-sdk/provider@3.0.14`）与嵌套的 `provider-utils-v7/node_modules/@ai-sdk/provider@4.0.4` 被错配成 3.0.14。改回 pnpm 默认 isolated 布局后，同一检查全部 `ok`，嵌套版本为 4.0.4。

打包日志中的 `cannot find path for dependency @ai-sdk/provider-v6@3.0.14` 在 isolated 布局下仍出现；该别名只在类型声明中被引用，运行时无 import，实测不影响。
