# T1 证据：CI 前置验证（2026-09-24）

工作流：`spike-v2.yml`（已从仓库移除，原文存本目录），GitHub Actions run 35990972822（提交 5394ea3；签名 job 构建基线提交 1369867 的应用，与验证内容无关）。

## models.dev 价格（job prices）

```
providers 223
anthropic 15 claude-haiku-4-5 {"input": 1, "output": 5, "cache_read": 0.1, "cache_write": 1.25}
deepseek 4 deepseek-v4-flash-vision-exp {"input": 0.15, "output": 0.6, "reasoning": 0.6, "cache_read": 0.003}
moonshotai 4 kimi-k3 {"input": 3, "output": 15, "cache_read": 0.3}
priced models 7749 / 8173
```
结论：`cost.input/output/cache_read`（美元/百万 token）存在，`scripts/prices.mjs` 按此截取。

## 自签证书更新链（job sign，macos-latest）

```
--- 未信任时 find-identity -v -p codesigning
     0 valid identities found
--- 信任后 find-identity -v -p codesigning
  1) … "River Self Signed"
• signing file=out-0.0.1/mac-arm64/River.app … identityName=River Self Signed
• signing file=out-0.0.2/mac-arm64/River.app … identityName=River Self Signed
Authority=River Self Signed
DR(0.0.1): identifier "app.river.desktop" and certificate leaf = H"d67a98de…"
B 签名完整
PASS: 0.0.2 满足 0.0.1 的 DR
DR(adhoc 0.0.1): cdhash H"a32b7470…"
test-requirement: code failed to satisfy specified code requirement(s)
EXPECTED: adhoc 0.0.2 不满足 0.0.1 的 DR
```

结论：
- 自签证书必须先 `add-trusted-cert -p codeSign` 设为受信任，electron-builder 才会列为有效身份（未信任时 0 个）。build.yml 已照此导入。
- 同一张证书签的两个版本，新版本满足旧版本的 designated requirement，Squirrel.Mac 的校验可以通过；ad-hoc 对照不满足。ADR-005 选项 A 成立，不需要退回选项 B。
- 未实测：真实的 electron-updater 下载与替换全过程（需要两个正式 Release 与一台 Mac）。首个正式版本发布后在 Mac 上装旧版验证一次。
