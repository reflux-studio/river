# T8 证据：自动更新与 CI 发布（2026-09-24）

## 本地打包（Linux）

```
npx electron-builder --linux dir -c.electronDist=node_modules/electron/dist -c.extraMetadata.version=0.2.0 --publish never
  • packaging       platform=linux arch=x64 electron=44.4.5 appOutDir=dist/linux-unpacked
```

产物 `dist/linux-unpacked/resources/app-update.yml`：

```
owner: reflux-studio
repo: river
provider: github
updaterCacheDirName: river-updater
```

`app.asar` 中含 `electron-updater`（70 个文件）。打包日志中的 `@ai-sdk/provider-v6 cannot find path` 与 libsql 其他平台可选依赖提示在 v1 已存在，不影响运行。

## 工作流自检

- 版本号：`VERSION=${GITHUB_REF_NAME#v}`，以 `-c.extraMetadata.version` 注入，`latest*.yml` 与安装包文件名一致。
- 价格快照：构建前运行 `node scripts/prices.mjs`（失败不阻断，沿用仓库内快照）。
- macOS：未配置 Secret 时 `::error::缺少 Secrets MAC_CERT_P12 / MAC_CERT_PASSWORD，见 README“发布”一节` 并退出；导入后 `add-trusted-cert -p codeSign`，`find-identity` 检查 `River Self Signed`；`-c.mac.identity="River Self Signed" -c.mac.forceCodeSigning=true`；打包后 `codesign -dvv` 断言 `Authority=River Self Signed`。
- Release：`draft: false`、`make_latest: true`，上传 dmg/zip/exe/AppImage/blockmap/`latest*.yml`。
- 自签更新链的可行性见 `evidence/T1/record.md`（0.0.2 满足 0.0.1 的 DR；ad-hoc 对照不满足）。

## 应用内

- `src/main/updater.ts`：仅打包后启用；启动 10 s 后与每 6 h 检查，自动下载；下载完成推 `update:ready`，退出时自动安装。
- 顶栏在不在牌桌时显示“新版本 x 已就绪 · 重启更新”；`update.install` 在牌桌上拒绝。
