# 005：自签证书签名 + electron-updater 实现全平台自动更新

状态：接受（用户 2026-09-24 决定：要自动更新，不要付费的 Apple 签名，同意“开发者自签证书”方案）
日期：2026-09-24

## 背景与问题

用户要求自动更新，只依赖 GitHub（参照 Tauri）。现有 macOS 构建为 ad-hoc 签名。electron-updater 在 macOS 通过 Squirrel.Mac 安装更新，要求新版本的签名满足当前版本的 designated requirement；ad-hoc 签名的要求是 cdhash，每个版本都不同，更新必然被拒。

## 可行选项

| 选项 | macOS | 代价 |
| --- | --- | --- |
| A. 固定一张自签代码签名证书，CI 每次用它签名；electron-updater 全平台 | designated requirement 为“bundle id + 该证书”，跨版本稳定，Squirrel.Mac 可通过（待 macOS CI 验证） | 需生成证书并存入 GitHub Secrets；首次安装仍需“仍要打开” |
| B. ad-hoc 签名 + 自己下载 zip、校验 sha512、替换 .app | 不依赖签名（Tauri 的思路） | 自写替换与重启逻辑，边界多 |
| C. Apple Developer ID + 公证 | 全自动、无 Gatekeeper 提示 | 年费 99 美元（用户拒绝） |
| D. 只提示下载 | 手动 | 用户拒绝 |

## 决定与理由

采用 A；若首个任务的 macOS CI 验证不通过（签名工具拒绝未受信任的自签身份，或 `codesign --verify -R` 不满足），退回 B。Windows（NSIS）与 Linux（AppImage）不依赖签名。

## 后果与重新考虑条件

- CI：`CSC_LINK`（p12 base64）、`CSC_KEY_PASSWORD` 存入 Secrets，macOS 构建用该身份签名，`hardenedRuntime` 仍关闭；从 tag 注入版本号；自动发布为正式 Release（非草稿），上传 `latest*.yml`、`.blockmap`，macOS 增加 `zip` 目标；`electron-builder.yml` 显式配置 GitHub publish。
- 从 ad-hoc 切换到证书签名的那一个版本，钥匙串可能把它视为不同应用，已保存的 API key 需重新输入一次（沿用现有 `needsKey` 提示）；之后稳定。
- 证书丢失即断更：新证书签的版本无法被旧版本自动更新，用户需手动重装一次。证书与密码需用户妥善备份。
- 重新考虑：购买 Developer ID 时切换到 C，同样会经历一次钥匙串与更新链的断点。

## 依据

用户对话 2026-09-24；`../reviews/design-1.md` F7（electron-builder 包内核实 GitHub provider、草稿不可见、macOS 需 zip）；Squirrel.Mac 的签名校验机制来自公开文档，待 macOS CI 实测。
