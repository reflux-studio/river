import { pokerEn, pokerZh } from './poker'
import { promptEn, promptZh } from './prompts'

// 语言名用各自的写法，两份字典相同
const localeNames = { zh: '中文', en: 'English' }

export const zh = {
  common: {
    localeNames,
    felt: { green: '经典绿', blue: '深海蓝', wine: '酒红', graphite: '石墨', paper: '素白' },
    currency: { cny: '人民币', usd: '美元', hkd: '港币', twd: '新台币', eur: '欧元', gbp: '英镑', jpy: '日元', krw: '韩元', sgd: '新加坡元' }
  },
  poker: pokerZh,
  desktop: {
    onboarding: {
      progress: (i: number, n: number) => `规则入门 · ${i} / ${n}`,
      skip: '跳过',
      prev: '上一步',
      next: '下一步',
      later: '稍后再说',
      configure: '去配置',
      guided: '带我打一手',
      lang: { t: '选择语言', b: '界面、对手和教练都会使用这种语言。选定后不能再更改。' },
      pages: [
        { t: '欢迎来到 River', b: '桌上只有你和 AI。每位对手都有自己的性格，轮到自己时会随行动说一句。教练站在你这边，只看你能看到的牌，随时可以问。' },
        { t: '目标：用 5 张牌比大小', b: '每人发 2 张只有自己能看的底牌，桌面陆续翻开 5 张公共牌。用这 7 张里任意 5 张组成最大的牌型；或者靠下注让其他人全部弃牌，也能直接赢下底池。' },
        { t: '牌型大小', b: '从大到小，上面的牌型永远大于下面的：' },
        { t: '一手牌的流程', b: '每手牌由两位玩家先放盲注，然后分四轮下注：' },
        { t: '教练和概率', b: '右侧会一直显示你的胜率和"所需胜率"（底池赔率）。胜率高于所需，跟注长期来看就是赚的。开桌时选“教练局”，每次轮到你教练都会先说说局面，一手结束还会复盘，并亮出所有人的底牌；你也可以随时提问，提问时牌局会暂停。' },
        { t: '配置模型', b: '对手和教练由大模型驱动。在设置里添加一个模型提供方，再分别为对手和教练选择模型。自由局需要对手模型，教练局还需要教练模型。' }
      ],
      flow: ['盲注', '翻牌前 · 2 张底牌', '翻牌 · 3 张', '转牌 · 1 张', '河牌 · 1 张', '摊牌'],
      acts: {
        check: '没人下注时，不花钱继续', bet: '率先投入筹码', call: '补齐到当前下注额',
        raise: '在别人的下注上再加', fold: '放弃这手牌和已投入的筹码', allin: '把剩余筹码全部推入'
      },
      model: { opponent: '对手模型', coach: '教练模型', none: '未配置' }
    }
  },
  prompt: promptZh
}

export const en: typeof zh = {
  common: {
    localeNames,
    felt: { green: 'Classic green', blue: 'Deep blue', wine: 'Wine', graphite: 'Graphite', paper: 'Paper' },
    currency: {
      cny: 'Chinese yuan', usd: 'US dollar', hkd: 'Hong Kong dollar', twd: 'New Taiwan dollar', eur: 'Euro', gbp: 'British pound',
      jpy: 'Japanese yen', krw: 'South Korean won', sgd: 'Singapore dollar'
    }
  },
  poker: pokerEn,
  desktop: {
    onboarding: {
      progress: (i, n) => `Rules · ${i} / ${n}`,
      skip: 'Skip',
      prev: 'Back',
      next: 'Next',
      later: 'Later',
      configure: 'Set up',
      guided: 'Play a hand with me',
      lang: { t: 'Choose a language', b: 'The interface, opponents and coach will all use this language. It can’t be changed later.' },
      pages: [
        { t: 'Welcome to River', b: 'It’s just you and AI at this table. Every opponent has a personality and says something as they act. The coach is on your side, sees only the cards you can see, and answers questions any time.' },
        { t: 'Goal: the best 5-card hand', b: 'Everyone gets 2 private hole cards, and 5 community cards are turned up on the board. Make the best hand from any 5 of those 7 — or bet until everyone else folds and win the pot outright.' },
        { t: 'Hand rankings', b: 'From strongest to weakest; a hand always beats the ones below it:' },
        { t: 'How a hand plays', b: 'Two players post the blinds, then there are four betting rounds:' },
        { t: 'Coach and odds', b: 'The right panel always shows your equity and the "equity needed" (pot odds). When your equity beats what’s needed, calling pays off in the long run. Pick "Coach game" when you sit down: the coach talks through the spot every time it’s your turn, reviews each hand when it ends and reveals everyone’s hole cards. You can ask questions any time; the game pauses while you do.' },
        { t: 'Set up models', b: 'Opponents and the coach are powered by LLMs. Add a model provider in Settings, then pick a model for opponents and one for the coach. Free games need an opponent model; coach games also need a coach model.' }
      ],
      flow: ['Blinds', 'Preflop · 2 hole cards', 'Flop · 3 cards', 'Turn · 1 card', 'River · 1 card', 'Showdown'],
      acts: {
        check: 'Continue for free when no one has bet', bet: 'Be the first to put chips in', call: 'Match the current bet',
        raise: 'Add more on top of a bet', fold: 'Give up the hand and the chips you put in', allin: 'Push all your remaining chips in'
      },
      model: { opponent: 'Opponent model', coach: 'Coach model', none: 'Not set' }
    }
  },
  prompt: promptEn
}

export type Dict = typeof zh
