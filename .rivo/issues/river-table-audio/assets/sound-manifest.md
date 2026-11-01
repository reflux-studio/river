# 牌局声音映射（方案附件）

负责人：Codex。日期：2026-11-01。状态：已随 plan.md v1.0 确认并接入运行目录；增益与音色仍需真实牌局试听验收。

主素材：[Kenney Casino Audio 1.1](https://kenney.nl/assets/casino-audio)，用户已选定，随包 License.txt 为 CC0。官方页面标注 50 项，实际 ZIP 的 Audio 目录有 54 个 OGG。原包 SHA-256：`f36250766ac5bc378c13708ddf12a23a8e54a3251f8d482c7536e51b5dbafa18`。

补充素材：[Kenney Impact Sounds 1.0](https://kenney.nl/assets/impact-sounds)，仅使用木质轻敲，随包 License.txt 为 CC0。SHA-256：`029d734af1582474edf3a694d1b0cebc97c1c152f2f39fa34d4c2bafc5de77f8`。用户已随方案确认补充素材。

| 事件 | 原文件/生成方式 | 单段时长约 | 播放建议 |
| --- | --- | --- | --- |
| deal | Casino Audio/card-slide-1.ogg | 0.601s | 每张一次，按方案发牌节奏 |
| board | Casino Audio/card-place-1.ogg、card-place-2.ogg | 0.689s / 0.456s | 每张一次，交替使用 |
| blind、call | Casino Audio/chip-lay-1.ogg、chip-lay-2.ogg | 0.170s / 0.227s | 按 seq 交替，单行动一次 |
| bet、raise | Casino Audio/chips-handle-1.ogg | 0.616s | 单行动一次 |
| allin | Casino Audio/chips-handle-5.ogg + chips-collide-1.ogg | 0.834s / 0.256s | 组合为一次强调，碰撞声延后约 120ms；替代普通行动音 |
| fold | Casino Audio/card-shove-1.ogg | 0.766s | 一次；按实听调整尾部长度 |
| check | Impact Sounds/impactWood_light_000.ogg、impactWood_light_002.ogg | 各 0.263s | 轻双敲，间隔约 100ms；补充建议 |
| collect | Casino Audio/chips-handle-1.ogg | 0.616s | 整批一次，较下注略低增益 |
| showdown | Casino Audio/card-place-2.ogg | 0.456s | 真实摊牌一次 |
| payout | Casino Audio/chips-stack-1.ogg | 0.285s | 每手一次；净盈利可加两次轻叠放，间隔约 100ms，失败无额外声 |
| turn | 程序生成短双音，660Hz/880Hz 正弦各约 65ms，间隔 35ms | 总约 0.165s | 平滑包络、低音量，无语音和循环催促；建议随方案确认 |

12 个实际候选文件合计 95,217 字节，均在 ego Chromium 中通过 decodeAudioData；记录见 ../evidence/material-decode/browser-decode.json 。时长为解码结果，并非裁切后的交付时长。实验仅解码，不自动播放，不代表已完成主观听感验收。

实际采用文件位于 `apps/desktop/src/renderer/src/assets/sounds/`，两份许可证和来源清单同目录。通过 Vite 静态 URL 导入打包；保留原文件名用于追溯。底牌飞行与声音共用 170ms 逐张间隔、500ms 单张飞行参数，当前值见 @river/ui/deal-timing。短提醒是本项目代码生成，无外部素材许可依赖。ZIP 中骰子、洗牌、纸牌包装与网页快捷方式不进入运行资源。
