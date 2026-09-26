// 官网营销文案（照设计稿 River Site v2 的 T 字典与页面文字）。对手预设、扑克术语、牌桌色名称不在这里，取自 @river/i18n
import type { Locale } from '@river/i18n'

type Act = ['bet' | 'call' | 'raiseTo', number] | ['fold']
type ChatLine = { sys: 'flop' | 'turn'; cards: string[] } | { a: string; act: Act; t?: string }

const zh = {
  meta: {
    htmlLang: 'zh-CN',
    title: 'River — 单人对 AI 的德州扑克',
    description: 'River：开源的 AI 德州扑克桌面应用。每位对手由一段性格提示词驱动，会下注、会嘴炮、会记仇；教练局每步讲解、随时提问、每手复盘。支持 macOS、Windows、Linux。',
    ogTitle: 'River — 和一桌有脾气的 AI 打德州',
    ogDescription: '开源的 AI 德州扑克，支持 macOS、Windows、Linux，模型自选。'
  },
  enHint: { text: 'River 也有英文页面。', link: 'English →', close: '关闭' },
  nav: { regulars: '牌友', features: '功能', models: '模型与花费', download: '下载' },
  hero: {
    badge: '开源 · macOS / Windows / Linux · 模型自选',
    title: ['和一桌有脾气的 AI', '打德州。'],
    lead: '桌上只有你和 AI。每位对手都有自己的性格，会诈唬、会嘴硬、还会记仇；想学，就开一桌教练局，让教练坐你身后。',
    source: '在 GitHub 上看源码',
    other: '其他平台'
  },
  demo: {
    appNav: ['大厅', '牌桌', 'AI 对手', '手牌回放', '数据统计', '设置'],
    hand: (n: number) => `第 ${n} 手`,
    table: '本桌',
    note: '演示桌由浏览器里的规则引擎驱动；在 River 里，每一次下注和每一句台词都来自你配置的大模型。',
    pause: '暂停',
    resume: '继续',
    status: (actor: string, done: boolean) => (done ? '一手结束 · 马上发下一手' : actor ? `等待 ${actor} 行动…` : '发牌中…'),
    seat: {
      thinking: '思考中…',
      folded: '弃牌',
      allin: (amount: string) => `全下 ${amount}`,
      won: (amount: string, cat: string) => `赢得 ${amount}${cat ? ' · ' + cat : ''}`
    }
  },
  regulars: {
    eyebrow: 'AI 对手',
    title: '八个常驻牌友，八种毛病。',
    lead: '每位对手就是一段性格提示词。轮到它时，一次调用同时决定下注和台词。看谁不顺眼就改，改动从下一次行动生效；还不够，就自己写一个。',
    custom: { ini: '新', name: '新对手', tag: '自建', prompt: '你是……（描述 TA 的打法：紧还是松、爱不爱诈唬；以及说话方式、口头禅）' },
    grudgeTitle: '它们会记仇。',
    grudge: '对手每次行动时，都可以给你记一条印象、或者记下自己的心情。下一手，它们带着这些印象坐回来。想让大家忘掉你上一把的蠢事？设置里一键重置 AI 记忆。',
    noted: (name: string) => `${name}记下`,
    notes: [['li', '你翻牌后被加注就弃，下次多打你。'], ['may', '上一把被你河牌偷了，这次不信你。'], ['prof', '该玩家翻前入池偏松，约 40%。']] as [string, string][]
  },
  chat: {
    eyebrow: '公屏',
    title: '牌桌上最吵的，永远不是你。',
    lead: '对手轮到自己时，会随行动说一句：虚张声势、点评牌面、顺便挤兑两句——但绝不老实报出底牌。公屏是它们的地盘，你专心打牌就好。',
    panel: '公屏',
    hide: '收起',
    lines: [
      { sys: 'flop', cards: ['Ks', '7h', '2d'] },
      { a: 'li', act: ['bet', 600], t: '这把我不装了，K 在我手里。' },
      { a: 'prof', act: ['call', 600], t: '按她的下注尺度，范围里有 K 的不到三成。' },
      { a: 'k', act: ['fold'] },
      { a: 'bai', act: ['call', 600], t: '我也不知道为啥跟，就是感觉！' },
      { sys: 'turn', cards: ['Ks', '7h', '2d', 'Qc'] },
      { a: 'li', act: ['raiseTo', 2400], t: '教授，数学救不了你。' }
    ] as ChatLine[]
  },
  coach: {
    eyebrow: '教练局',
    title: ['教练坐你身后，', '只看你能看到的牌。'],
    lead: '每次轮到你，教练先说说局面和建议；有不懂的随时问，提问时牌局会暂停。胜率和所需胜率在本地算好，一眼看出这手跟注是赚是亏。三种人设、两档讲解深度——点左边试试。',
    modes: [['教练局', '每步讲解、随时提问、一手结束亮出所有底牌并复盘。'], ['自由局', '没有教练，只留概率面板，自己打。']] as [string, string][],
    ini: '师',
    head: (name: string) => `教练 · ${name} ▾`,
    sub: '每步先讲解 · 每手自动复盘',
    coaches: ['温和老师', '直白教练', '数据派'],
    says: [
      '别慌，你手里 A♦ Q♦ 已经有四张方块，再来一张就是同花。对手这注不算大，跟下去看一张很划算～',
      '跟。9 张出路，胜率 38% 高于所需的 25%，别弃。',
      '胜率 38%，所需 25.0%。跟注 EV ≈ (0.38 × 底池) − (0.62 × 跟注)，为正。结论：跟。'
    ],
    levels: [['novice', '新手讲解'], ['pro', '进阶分析']] as [string, string][],
    quick: { novice: ['现在该怎么打？', '对手可能有什么牌？', '什么是底池赔率？'], pro: ['对手的范围？', '加注还是平跟？', '河牌怎么计划？'] } as Record<string, string[]>,
    equity: '胜率 vs 所需胜率',
    plusEv: '跟注 +EV',
    prob: [['当前牌型', '同花听牌'], ['出路', '9'], ['规则建议', '跟注']] as [string, string][],
    local: '本地计算 · 胜率按对手随机手牌估算',
    hardOn: '硬核模式：概率信息已隐藏。',
    handTag: '第 12 手 · 教练',
    ask: '问问教练…',
    pauseAsk: '暂停并提问',
    hard: '硬核模式 · 隐藏概率'
  },
  recap: {
    eyebrow: '复盘',
    title: '不以结果论英雄。',
    lead: '不论输赢，每手打完都复盘：一句话总结，做得好、可改进、下次记住。反复出现的漏洞，教练会记进你的学员档案。错过的手牌，在手牌回放里随时让教练补上。',
    head: '第 47 手复盘',
    summary: '翻牌中暗三条没急着打，河牌一枪打在教授最难弃的尺寸上。',
    rows: [['做得好', '翻牌慢打，让阿狸替你把底池做大。'], ['可改进', '转牌 Q♥ 出来时下注偏小，给了听牌便宜的赔率。'], ['下次记住', '牌面湿润时，强牌要收费。']] as [string, string][]
  },
  effects: {
    eyebrow: '动效',
    title: ['有人全下，', '整张桌子都会抖。'],
    lead: 'ALL IN 字样弹出，金红光环一圈圈扩开，筹码四散飞出。发牌、翻牌、筹码入池、赢家收筹码也都有动画。嫌闹？切到精简或关闭。',
    fx: '动效',
    felt: '桌布',
    back: '牌背',
    custom: '自选颜色',
    fxOpts: [['full', '完整'], ['lite', '精简'], ['off', '关闭']] as [string, string][],
    backN: (n: number) => `牌背 ${n}`,
    allin: '全下 10,000',
    fold: '弃牌'
  },
  models: {
    eyebrow: '模型与花费',
    title: ['模型你自己挑，', '账单你自己看。'],
    lead: '添加任意模型提供方——主流厂商或 OpenAI 兼容接口都行——再分别给对手和教练选一个模型。River 不做中间商：请求从你的电脑直接发出，花了多少实时算给你看。',
    providersLabel: '设置 · 模型提供方',
    providers: [['Anthropic', 'Anthropic · 已保存 ····7f3a · 已测试 · 支持强制工具调用'], ['本地模型', 'OpenAI 兼容 · http://localhost:11434/v1 · 未设置 API key · 已测试 · 工具调用降级为自动']] as [string, string][],
    edit: '编辑',
    test: '测试连接',
    add: '添加提供方',
    roles: [
      ['对手模型', '所有对手共用这个模型，各自按性格提示词行动。开桌必需。', 'Anthropic', 'claude-haiku-4-5', '连接成功 · 支持强制工具调用'],
      ['教练模型', '教练局需要它：每步讲解、提问与每手复盘。自由局不用。', 'Anthropic', 'claude-sonnet-4-5', '连接成功 · 支持强制工具调用']
    ] as [string, string, string, string, string][],
    usageLabel: '数据统计 · LLM 用量与花费（示例）',
    usage: 'LLM 用量与花费',
    purposes: { decide: 'AI 决策', speak: '教练讲解', ask: '教练问答', recap: '每手复盘' } as Record<string, string>,
    kpis: ['估算花费', '调用次数', '平均每手'],
    kpiH: ['按 models.dev 价格估算', '对手与教练合计', '基于 38 手'],
    perHand: '每手花费 · 最近 24 手',
    foot: 'Token 来自提供方返回的用量；价格来自 models.dev，按自动或手动汇率换成 9 种货币。没有公开价格的模型只统计 token。'
  },
  extras: {
    title: '还有这些',
    items: [
      ['手牌回放', '每一手按街道逐条回看行动；还没复盘的，点一下让教练补上。'],
      ['数据统计', '净盈亏、每手盈亏、VPIP 入池率、PFR 翻前加注、摊牌胜率。'],
      ['教学牌局', '第一次玩？一分钟规则入门，再跟着教练在 3 人小桌上打一手。'],
      ['快捷键', 'F 弃牌、C 跟注、R 加注、N 下一手，手不离键盘。'],
      ['数据在你电脑上', '手牌、复盘、AI 记忆都存在本地数据库里，API key 加密保存。'],
      ['自动更新', '后台检查 GitHub 上的新版本并下载，离开牌桌时提示重启。']
    ] as [string, string][]
  },
  download: {
    title: '下载 River',
    all: '全部版本 ›',
    ver: (v?: string) => (v ? `最新版本 ${v}` : '最新版本'),
    platforms: [
      ['mac', 'macOS', 'Apple 芯片 · .dmg', '下载 .dmg', '首次打开提示“无法验证开发者”：到 系统设置 → 隐私与安全性 底部点“仍要打开”。'],
      ['win', 'Windows', 'x64 · -setup.exe', '下载安装程序', 'SmartScreen 提示时，点“更多信息 → 仍要运行”。'],
      ['linux', 'Linux', 'x64 · .AppImage', '下载 .AppImage', '下载后加上可执行权限（chmod +x）再运行。']
    ] as [string, string, string, string, string][],
    cta: { mac: '下载 macOS 版', win: '下载 Windows 版', linux: '下载 Linux 版' } as Record<string, string>,
    first: '首次打开',
    foot: '安装包用自签证书签名、未经 Apple 公证，所以首次打开会有系统提示，放行一次即可。之后 River 会在后台自动更新。'
  },
  faq: {
    title: '牌友常问',
    items: [
      ['要花钱吗？', 'River 免费、开源。唯一的开销是你自己的模型用量：每桌花了多少实时显示在顶栏，数据统计里还能按用途和每手细看。用 OpenAI 兼容接口接本地模型，就只统计 token、不产生账单。'],
      ['能用哪些模型？', 'Mastra 模型路由里支持的厂商都可以，另外任何 OpenAI 兼容接口也能接。对手和教练各选一个模型；添加后可以“测试连接”，看看它是否支持强制工具调用。'],
      ['我的 API Key 安全吗？', 'Key 加密保存在你自己的电脑上，请求直接发往你选的提供方，不经过任何我们的服务器——我们也压根没有服务器。代码都在 GitHub 上，欢迎审计。'],
      ['没有配置模型能玩吗？', '不能。对手和教练都由大模型驱动：自由局需要对手模型，教练局还需要教练模型。首次启动的规则入门最后一页会带你去配置。'],
      ['能打真钱吗？', '不能，以后也不会。筹码纯属虚构，输光了点一下就能重新买入。'],
      ['为什么打开时系统说“无法验证开发者”？', '安装包用自签证书签名，没有经过 Apple 公证。macOS 到“系统设置 → 隐私与安全性”点“仍要打开”；Windows 在 SmartScreen 里点“更多信息 → 仍要运行”。只需要一次。']
    ] as [string, string][]
  },
  end: { title: '位置给你留好了。', star: '给个 Star' },
  footer: 'reflux studio 出品 · 纯娱乐，筹码不涉及真钱'
}

const en: typeof zh = {
  meta: {
    htmlLang: 'en',
    title: 'River — Hold’em against AIs with attitude',
    description: 'River is an open-source AI poker desktop app. Every opponent runs on a personality prompt — they bet, trash-talk and hold grudges. Coach tables explain every turn, take questions and review every hand. For macOS, Windows and Linux.',
    ogTitle: 'River — Hold’em against AIs with attitude',
    ogDescription: 'Open-source AI poker for macOS, Windows and Linux. Bring your own model.'
  },
  enHint: { text: 'River is also available in English.', link: 'English →', close: 'Dismiss' },
  nav: { regulars: 'Regulars', features: 'Features', models: 'Models & cost', download: 'Download' },
  hero: {
    badge: 'Open source · macOS / Windows / Linux · Bring your own model',
    title: ['Hold’em against a table', 'of AIs with attitude.'],
    lead: 'It’s just you and the AIs. Every opponent has a personality — they bluff, they trash-talk, they hold grudges. Want to learn? Open a coach table and someone sits behind you.',
    source: 'View source on GitHub',
    other: 'Other platforms'
  },
  demo: {
    appNav: ['Lobby', 'Table', 'Opponents', 'Replays', 'Stats', 'Settings'],
    hand: (n) => `Hand ${n}`,
    table: 'Table',
    note: 'This demo runs on a rules engine in your browser. In River, every bet and every line comes from the model you configure.',
    pause: 'Pause',
    resume: 'Resume',
    status: (actor, done) => (done ? 'Hand over · next one coming' : actor ? `Waiting for ${actor}…` : 'Dealing…'),
    seat: {
      thinking: 'Thinking…',
      folded: 'Folded',
      allin: (amount) => `All-in ${amount}`,
      won: (amount, cat) => `Won ${amount}${cat ? ' · ' + cat : ''}`
    }
  },
  regulars: {
    eyebrow: 'AI opponents',
    title: 'Eight regulars. Eight bad habits.',
    lead: 'Each opponent is a single personality prompt. On its turn, one model call decides both the bet and the line. Edit anyone — changes apply from their next action — or write your own.',
    custom: { ini: '+', name: 'New opponent', tag: 'Custom', prompt: 'You are… (how they play — tight or loose, how often they bluff — and how they talk)' },
    grudgeTitle: 'They hold grudges.',
    grudge: 'Each time they act, opponents can jot down an impression of you — or how they’re feeling. Next hand, they sit down with those notes. Want them to forget that last blunder? Reset AI memory in settings.',
    noted: (name) => `${name} noted`,
    notes: [['li', 'Folds to flop raises. Pressure them more.'], ['may', 'Got bluffed on the river last time. Not buying it again.'], ['prof', 'Loose preflop — enters about 40% of pots.']]
  },
  chat: {
    eyebrow: 'Table chat',
    title: 'The loudest one at the table is never you.',
    lead: 'When it’s their turn, opponents say one line with their action — bluster, board talk, the odd jab — but they’ll never honestly reveal their cards. The chat is theirs; you just play.',
    panel: 'Table chat',
    hide: 'Hide',
    lines: [
      { sys: 'flop', cards: ['Ks', '7h', '2d'] },
      { a: 'li', act: ['bet', 600], t: 'Not hiding it — I’ve got the king.' },
      { a: 'prof', act: ['call', 600], t: 'Given her sizing, under a third of her range has a king.' },
      { a: 'k', act: ['fold'] },
      { a: 'bai', act: ['call', 600], t: 'No idea why I’m calling. Just a feeling!' },
      { sys: 'turn', cards: ['Ks', '7h', '2d', 'Qc'] },
      { a: 'li', act: ['raiseTo', 2400], t: 'Math won’t save you, Prof.' }
    ]
  },
  coach: {
    eyebrow: 'Coach table',
    title: ['A coach behind your chair — who only sees your cards.'],
    lead: 'Each turn the coach reads the spot and gives advice first. Ask anything — the table pauses while you do. Equity and required equity are computed locally, so you see at a glance whether a call makes money. Three personas, two depth levels — try them on the left.',
    modes: [['Coach table', 'Advice every turn, questions any time, all hole cards revealed and reviewed after each hand.'], ['Free table', 'No coach — just the odds panel. You’re on your own.']],
    ini: 'C',
    head: (name) => `Coach · ${name} ▾`,
    sub: 'Speaks first each turn · reviews every hand',
    coaches: ['Gentle teacher', 'Blunt coach', 'Numbers'],
    says: [
      'No rush — with A♦ Q♦ you already have four diamonds, one more makes a flush. The bet isn’t big, so seeing another card is a good deal.',
      'Call. Nine outs, 38% equity beats the 25% you need. Don’t fold.',
      'Equity 38%, required 25.0%. Call EV ≈ (0.38 × pot) − (0.62 × call) > 0. Verdict: call.'
    ],
    levels: [['novice', 'Beginner'], ['pro', 'Advanced']],
    quick: { novice: ['What should I do?', 'What might they have?', 'What are pot odds?'], pro: ['Their range?', 'Raise or flat?', 'River plan?'] },
    equity: 'Equity vs required',
    plusEv: 'Call +EV',
    prob: [['Hand', 'Flush draw'], ['Outs', '9'], ['Rule of thumb', 'Call']],
    local: 'Computed locally · vs. random opponent hands',
    hardOn: 'Hardcore mode: odds hidden.',
    handTag: 'Hand 12 · Coach',
    ask: 'Ask the coach…',
    pauseAsk: 'Pause & ask',
    hard: 'Hardcore · hide odds'
  },
  recap: {
    eyebrow: 'Hand review',
    title: 'Judged on decisions, not results.',
    lead: 'Win or lose, every hand gets reviewed: a one-line summary, what went well, what to fix, what to remember. Recurring leaks go into your student file. Missed one? Ask for a review from hand replays any time.',
    head: 'Hand 47 review',
    summary: 'Flopped a set, stayed patient, then fired a river size the Prof couldn’t fold.',
    rows: [['Good', 'Slow-played the flop and let Foxy build the pot for you.'], ['Fix', 'Bet too small when Q♥ hit the turn — cheap price for draws.'], ['Remember', 'On wet boards, make strong hands pay.']]
  },
  effects: {
    eyebrow: 'Table effects',
    title: ['When someone shoves,', 'the whole table shakes.'],
    lead: 'ALL IN pops up, gold and red rings ripple out, chips scatter. Dealing, flops, bets and pot pushes are animated too. Too much? Switch to reduced or off.',
    fx: 'Effects',
    felt: 'Felt',
    back: 'Backs',
    custom: 'Custom color',
    fxOpts: [['full', 'Full'], ['lite', 'Reduced'], ['off', 'Off']],
    backN: (n: number) => `Card back ${n}`,
    allin: 'All-in 10,000',
    fold: 'Fold'
  },
  models: {
    eyebrow: 'Models & cost',
    title: ['Pick your model.', 'Watch your bill.'],
    lead: 'Add any provider — major vendors or any OpenAI-compatible endpoint — then pick one model for opponents and one for the coach. No middleman: requests go straight from your computer, and the cost is tallied live.',
    providersLabel: 'Settings · Providers',
    providers: [['Anthropic', 'Anthropic · saved ····7f3a · tested · forced tool calls supported'], ['Local server', 'OpenAI-compatible · http://localhost:11434/v1 · no API key · tested · tool calls fall back to auto']],
    edit: 'Edit',
    test: 'Test',
    add: 'Add provider',
    roles: [
      ['Opponent model', 'Shared by all opponents, each acting on their own prompt. Required to open a table.', 'Anthropic', 'claude-haiku-4-5', 'Connected · forced tool calls supported'],
      ['Coach model', 'Needed for coach tables: turn advice, questions and hand reviews. Not used at free tables.', 'Anthropic', 'claude-sonnet-4-5', 'Connected · forced tool calls supported']
    ],
    usageLabel: 'Stats · LLM usage & cost (example)',
    usage: 'LLM usage & cost',
    purposes: { decide: 'AI decisions', speak: 'Coach advice', ask: 'Coach Q&A', recap: 'Hand reviews' },
    kpis: ['Est. cost', 'Calls', 'Per hand'],
    kpiH: ['At models.dev prices', 'Opponents + coach', 'Over 38 hands'],
    perHand: 'Cost per hand · last 24',
    foot: 'Tokens come from what the provider reports; prices from models.dev, converted into 9 currencies at an auto or manual rate. Models without public prices are counted in tokens only.'
  },
  extras: {
    title: 'Also in the box',
    items: [
      ['Hand replays', 'Step through every hand street by street. Not reviewed yet? One click asks the coach.'],
      ['Stats', 'Net result, per-hand swings, VPIP, PFR and showdown win rate.'],
      ['Guided hand', 'New to poker? A one-minute rules intro, then one hand at a 3-seat table with the coach talking you through it.'],
      ['Hotkeys', 'F fold, C call, R raise, N next hand. Hands stay on the keyboard.'],
      ['Your data stays local', 'Hands, reviews and AI memory live in a local database; API keys are stored encrypted.'],
      ['Auto-update', 'Checks GitHub for new releases in the background and asks you to restart once you leave the table.']
    ]
  },
  download: {
    title: 'Download River',
    all: 'All releases ›',
    ver: (v) => (v ? `Latest ${v}` : 'Latest release'),
    platforms: [
      ['mac', 'macOS', 'Apple silicon · .dmg', 'Download .dmg', 'If macOS says it can’t verify the developer: System Settings → Privacy & Security → “Open Anyway”.'],
      ['win', 'Windows', 'x64 · -setup.exe', 'Download installer', 'If SmartScreen appears: “More info → Run anyway”.'],
      ['linux', 'Linux', 'x64 · .AppImage', 'Download .AppImage', 'Make it executable (chmod +x), then run.']
    ],
    cta: { mac: 'Download for macOS', win: 'Download for Windows', linux: 'Download for Linux' },
    first: 'First launch',
    foot: 'Builds use a self-signed certificate and aren’t notarized, so the OS asks once on first launch. After that, River updates itself in the background.'
  },
  faq: {
    title: 'Questions from the rail',
    items: [
      ['Does it cost anything?', 'River is free and open source. The only cost is your own model usage: the current table’s cost sits in the top bar, and Stats breaks it down by purpose and by hand. Point it at a local OpenAI-compatible model and it only counts tokens — no bill.'],
      ['Which models can I use?', 'Any vendor supported by Mastra’s model router, plus any OpenAI-compatible endpoint. Pick one model for opponents and one for the coach, then “Test” to check forced tool-call support.'],
      ['Is my API key safe?', 'Keys are stored encrypted on your computer and requests go straight to the provider you chose — never through a server of ours (we don’t have one). All the code is on GitHub. Audit away.'],
      ['Can I play without a model?', 'No. Opponents and the coach are model-driven: free tables need an opponent model, coach tables also need a coach model. The last page of the first-run intro takes you to setup.'],
      ['Can I play for real money?', 'No, and it never will. Chips are imaginary — go broke and one click buys you back in.'],
      ['Why does my OS warn me when opening it?', 'Builds use a self-signed certificate and aren’t notarized by Apple. On macOS go to System Settings → Privacy & Security → “Open Anyway”; on Windows click “More info → Run anyway”. Only once.']
    ]
  },
  end: { title: 'Your seat is open.', star: 'Star on GitHub' },
  footer: 'Made by reflux studio · For fun — chips aren’t real money'
}

export type SiteDict = typeof zh
export const site: Record<Locale, SiteDict> = { zh, en }
