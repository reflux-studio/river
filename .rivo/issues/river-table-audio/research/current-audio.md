# 牌局音效现状

负责人：Codex。调查日期：2026-11-01。
依据版本：`2b7047c19465f5607be3695130a9cae999c9e623` 的当前工作区。仅静态调查，未启动应用或试听。工作区原有未跟踪的 river-desktop/reviews/final-1.md 未参与本次调查，也未修改。

## 结论

River 是 Electron + React 的单人对 AI 德州扑克教学应用，支持自由局、教练局及引导局。当前应用源码中未找到音频播放器、音频资源或音效设置。已有牌局视觉特效，但音效需要新增。

用户提出筹码、过牌、Fold、轮到你、All-in 应有对应音效。这能支持本次需求探索；目前没有其他用户反馈或使用数据，不能据此量化流失、漏操作频率或音效收益。

## 来源与影响

| 来源 | 静态发现 | 对本次需求的影响 |
| --- | --- | --- |
| README.md、package.json | pnpm monorepo；桌面应用、Astro 官网及 engine/ui/i18n 共享包 | 首版范围可先聚焦桌面端，官网另行决定 |
| packages/ui/src/fx.ts、table-stage.tsx | 已有底牌、公牌、下注筹码、弃牌、All-in、获胜动画；按视图变化驱动 | 可协调声音和动画；不能把音效是否开启绑定到视觉特效档位 |
| apps/desktop/src/shared/types.ts | Settings 无音效字段；TableView 有 isTurn、coach.locked、stalled、done；Events 包含视图与聊天推送 | 设置持久化和事件传递均需开发设计；仅有状态字段不等于已有可靠音效事件 |
| apps/desktop/src/renderer/src/lib/river.ts | bootstrap 恢复快照，聊天消息按 id 去重；视图持续更新；页面可切换 | 初次恢复、重复推送、页面切换不能重播历史音效 |
| apps/desktop/src/renderer/src/components/table/ActionBar.tsx | canAct = isTurn && !coach.locked；C 键同时用于过牌/跟注，跟注也可能 All-in | 提醒应在真正可操作时触发；动作音以实际结果分类，不能按按钮名称播放 |
| apps/desktop/src/main/table/runner.ts | 动作由主进程校验后执行；教练在决策点讲解/回答时可能锁定操作 | 点击不等于成功动作；同一决策点的问答解锁不宜反复提醒 |
| apps/site/src/components/DemoTable.tsx | 官网自动运行牌局演示，也使用 TableStage | 修改共享组件时要防止官网自动发声 |
| apps/desktop/src/renderer/src/pages/Settings.tsx、components/Appearance.tsx；main/db/index.ts | 已有视觉特效 full/lite/off 和设置保存路径 | 需独立声音入口和旧配置兼容规则 |

## 待开发核实

现有共享 UI 按快照差异驱动动画。快照可能不足以区分连续同类型行动、收注与下注、All-in 跟注、跨街行动和事件重放。开发需确定语义事件、唯一身份、初始同步及生命周期的可靠方案。

音源来源、许可、打包体积、离线播放及 Electron 各平台音频行为尚未验证。没有开展真实牌局听感、音量平衡、延迟或无障碍使用验证。
