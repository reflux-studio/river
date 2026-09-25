# T9 验证记录

日期：2026-09-26，基于 `feat/monorepo-site-i18n` @ 05395c3 加本任务改动。

## workflow 语法

本机没有 actionlint（`which actionlint`、`brew list actionlint` 均无，也没有 go、docker）。改用 `npx --yes @action-validator/cli <file>`（按 GitHub workflow JSON schema 校验）：

| 文件 | 结果 |
| --- | --- |
| build.yml | exit 0 |
| ci.yml | exit 0 |
| site.yml | exit 0（提示：`on.push.paths` 的 glob 不校验） |

校验器有效性：故意写错 `working-directroy` 的样例返回 exit 1 并指出该键。
action-validator 不做 actionlint 的表达式/shellcheck 检查，以下人工核对：

- `site.yml` 与官方 Pages 示例（actions/starter-workflows `pages/astro.yml`、`pages/static.yml`）一致：权限 `contents: read`、`pages: write`、`id-token: write`；`concurrency: { group: pages, cancel-in-progress: false }`；deploy job `environment: { name: github-pages, url: ${{ steps.deployment.outputs.page_url }} }`，`id: deployment` 的 `actions/deploy-pages@v5`；上传用 `actions/upload-pages-artifact@v3`（官方 astro 示例版本）。未加 `actions/configure-pages`：`base` 已在 astro.config 写死，不需要它注入。
- `build.yml`、`ci.yml`、`site.yml` 的 checkout/setup-node/pnpm action-setup 沿用 build.yml 原有的 `@v4`。
- `build.yml` 的 `working-directory: apps/desktop` 加在 prices、版本号、打包、codesign 断言四步；安装、证书导入仍在根目录。`scripts/prices.mjs` 用 `import.meta.url` 定位输出，与 cwd 无关。

## 本地按 workflow 顺序模拟

| 命令（仓库根目录，除注明外） | 结果 |
| --- | --- |
| `pnpm install --frozen-lockfile --offline` | exit 0，Already up to date（pnpm v11.22.0） |
| `pnpm typecheck` | exit 0；6 个项目通过，astro check 0 errors / 0 warnings |
| `pnpm test` | exit 0；engine 36、i18n 4、ui 5、site 1、desktop 120，全部通过 |
| `pnpm build:site --outDir <scratchpad>/site-dist` | exit 0；产出 `index.html`、`en/index.html`（2 页） |
| `cd apps/desktop && pnpm build` | exit 0；产出 `out/{main,preload,renderer}` |
| `node -p "require('./apps/desktop/package.json').version"` | `0.2.1`（版本号步骤在 apps/desktop 下读取的值） |

`build:site` 输出到 scratchpad 而不是 `apps/site/dist`：T8 审阅者可能正用 astro preview 读 `apps/site/dist`，避免覆盖。`astro.config` 未设 `outDir`，默认即 `apps/site/dist`，该目录已存在（含 `index.html`、`en/`、`_astro/`），即 `upload-pages-artifact` 的 `path`。

## 未做（需推送后由主代理在用户同意后进行）

- 推送分支后 `ci.yml` 通过；
- 分支上手动触发 `build.yml`，三平台产出安装包（结果链接补记于此）；
- `site.yml` 只能合并后验证；合并前需用户在 Settings → Pages 把来源设为 GitHub Actions。
