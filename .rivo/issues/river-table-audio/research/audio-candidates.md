# 牌局音效试听候选

负责人：Codex。调查日期：2026-11-01。来源：素材官方页面和 ego-browser 试听控件检查。用户已选定 Kenney Casino Audio（产品决定 D6）；下表其他候选仅保留调查依据。尚未修改应用代码。

## 已选素材与获取情况

用户在 Kenney Casino Audio 页面试听后回复“感觉不错啊，就用这个吧”，确定采用该素材包。2026-11-01 已通过官方网页下载 Casino Audio 1.1，随包许可证核对为 CC0，Audio 目录实际含 54 个 OGG；筹码、滑牌、放牌、收牌均有候选，独立敲桌与短提醒缺失。实际映射、来源和 SHA-256 统一见 ../assets/sound-manifest.md 。

直链曾返回 302/403，最终在用户回复“继续”后恢复同一浏览器空间，通过 Download → Continue without donating 获取网站生成的有效下载链接，成功保存原包。为了核对敲桌补充建议，同步下载同作者 Impact Sounds 1.0，其随包许可证也是 CC0；仅作为方案建议，尚未纳入应用。

通过本机临时 HTTP 服务，在 ego Chromium 用 decodeAudioData 解码映射中的 12 个候选，全部成功，合计原文件 95,217 字节。实验记录在 ../evidence/material-decode/browser-decode.json；测试不发声，不能证明听感或 Electron 各平台行为。解码后 ArrayBuffer 会被转移，证据中的 bytes 已按实际文件大小补全。临时服务和实验页面已关闭。

## 建议试听顺序

先听 Kenney 整包预览判断总体方向，再对照单条录音。以下用途是按素材名称和作者描述匹配的候选，不代表完成听感筛选。后续需裁切头尾、统一音量，并在完整牌局验证高频播放。

| 编号 | 建议用途 | 来源与试听入口 | 作者/许可 |
| --- | --- | --- | --- |
| S1 | 筹码与牌张的统一基础音色 | [Kenney Casino Audio](https://kenney.nl/assets/casino-audio)，官方 35 秒整包预览 | Kenney；随包 CC0；官网标注 50 项，实际 Audio 目录 54 个 OGG，已下载核对 |
| S2 | 跟注、普通下注 | [Placing poker chips](https://pixabay.com/sound-effects/film-special-effects-placing-poker-chips-522521/) | OxidVideos；Pixabay Content License |
| S3 | All-in 推筹码 | [AllInPushChips](https://pixabay.com/sound-effects/film-special-effects-allinpushchips-96121/) | joeyed，经 freesound_community 发布；页面标注 Pixabay Content License |
| S4 | 公共牌落桌 | [Placing playing card](https://pixabay.com/sound-effects/film-special-effects-placing-playing-card-522514/) | OxidVideos；Pixabay Content License |
| S5 | Fold 收牌/滑牌候选 | [Taking playing card - 2](https://pixabay.com/sound-effects/film-special-effects-taking-playing-card-2-522516/) | OxidVideos；Pixabay Content License；拿牌是否适合弃牌需听感确认 |
| S6 | Check 敲桌 | [Soft_Wood_Knock_Double](https://pixabay.com/sound-effects/household-soft-wood-knock-double-514334/) | HerrParadox；Pixabay Content License |
| S7 | 轮到你提醒 A | [Soft Tone 001](https://pixabay.com/sound-effects/technology-soft-tone-001-9755/) | EdR；页面描述为轻柔双音提示；Pixabay Content License |
| S8 | 轮到你提醒 B | [Notification - soft digital ping](https://pixabay.com/sound-effects/technology-notification-soft-digital-ping-496718/) | YUSUF_SFX；Pixabay Content License |

补充候选：[Shuffling Deck of Cards](https://pixabay.com/sound-effects/film-special-effects-shuffling-deck-of-cards-522518/)。仅作音色参考；首版没有新增可见洗牌流程，不因有素材而插入无对应动作的声音。

## 许可与交付判断

[Kenney Casino Audio](https://kenney.nl/assets/casino-audio)、[Impact Sounds](https://kenney.nl/assets/impact-sounds)、[Interface Sounds](https://kenney.nl/assets/interface-sounds) 官方页面分别标注 CC0。CC0 摘要允许复制、修改和分发，包括商用，见 [Creative Commons 官方说明](https://creativecommons.org/publicdomain/zero/1.0/)。前两套已下载核对随包许可与候选文件；Interface Sounds 未选用也未下载。

Pixabay 单条录音先用于比较。其 [Content License 摘要](https://pixabay.com/service/license-summary/)允许免费使用和修改，同时限制原样独立再分发。若把资源放入开源仓库，不能直接等同 CC0；选用前需核对完整条款、原作者来源和实际分发方式。当前未将任何 Pixabay 音频下载或纳入应用。

## 实际检查与限制

Kenney 官方页面在浏览器中显示原生音频播放器，时长 35 秒。预览地址为 https://kenney.nl/media/pages/assets/casino-audio/00b14883ce-1677590187/preview-2.ogg 。

AllInPushChips 官方页面无需登录即可看到播放按钮。ego-browser 点击后初始加载，随后音频元素报告时长 0.966531 秒、readyState=4，播放已结束且没有报告媒体错误，证明该次加载/播放链路可用。结束后已暂停音频，浏览器保留 Kenney 试听页交给用户。

这不是主观听感验收，也不保证所有候选在每个网络环境都能加载。尚未进行全批试听、波形分析、裁切、混音或桌面应用集成测试。
