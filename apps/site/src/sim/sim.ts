// 演示桌自动对局，对应设计稿 river-site.js 的 createSim：节奏、气泡台词、暂停/继续、筹码归零重新买入
import { Table, type Rng } from '@river/engine'
import { decide, PERSONA } from './bot'

type Kind = 'raise' | 'allin' | 'call' | 'fold' | 'check' | 'win'
type Lines = { zh: string[]; en: string[] }
const L = (zh: string[], en: string[]): Lines => ({ zh, en })

// 设计稿的 LINES：演示用台词，按对手预设 id 对应，_ 为兜底
const LINES: Record<string, Partial<Record<Kind, Lines>>> = {
  li: { raise: L(['加点，怕了？', '这把我不装了。'], ['A little more. Scared?', 'Not hiding it this time.']), allin: L(['全下！接不接？'], ['All in. Your move.']), call: L(['跟，看你能演多久。'], ['Call. Let’s see how long you can act.']), fold: L(['这把让你。'], ['Fine, have this one.']), win: L(['就这？', '谢谢各位的筹码～'], ['That’s it?', 'Thanks for the chips~']) },
  k: { raise: L(['加。'], ['Raise.']), allin: L(['全下。'], ['All in.']), call: L(['跟。'], ['Call.']), win: L(['嗯。'], ['Mm.']) },
  bai: { raise: L(['我加注！是这么说的吧？'], ['I raise! That’s how you say it, right?']), call: L(['跟跟跟！万一中了呢', '我也不知道为啥跟'], ['Call! What if I hit?', 'No idea why I’m calling tbh']), fold: L(['啊…还是弃了吧'], ['Uh… I’ll fold I guess']), check: L(['过！过是啥意思来着'], ['Check! Wait, what’s check again']), allin: L(['全下！！我感觉很好！'], ['ALL IN!! I have a good feeling!']), win: L(['我赢了？？我赢了！！'], ['I won?? I WON!!']) },
  prof: { raise: L(['三分之二底池，教科书操作。'], ['Two-thirds pot. Textbook.']), call: L(['赔率 3.2 比 1，数学上必须跟。'], ['Getting 3.2 to 1. Mathematically a call.']), fold: L(['期望值为负，理性弃牌。'], ['Negative EV. Rational fold.']), allin: L(['我算过了。'], ['I’ve run the numbers.']), win: L(['概率不会骗人。'], ['Probability never lies.']) },
  may: { raise: L(['这把我要拿回来！'], ['I’m winning this one back!']), call: L(['跟！我不信你。'], ['Call! I don’t believe you.']), fold: L(['哼，下把再说。'], ['Hmph. Next hand.']), allin: L(['上头了，全下！'], ['I’m tilted. All in!']), win: L(['看到没！看到没！'], ['See that?! SEE THAT?!']) },
  rock: { raise: L(['……加。'], ['…Raise.']), allin: L(['我有。'], ['I have it.']), win: L(['早说了。'], ['Told you.']) },
  cow: { raise: L(['年轻时我在拉斯维加斯也这么加。'], ['Back in Vegas I raised just like this.']), allin: L(['全下！运气站我这边！'], ['All in! Luck rides with me!']), call: L(['跟了，赌一把。'], ['Call. Let’s gamble.']), win: L(['我就说嘛！'], ['Knew it!']) },
  zen: { check: L(['过。'], ['Check.']), raise: L(['心静，加注。'], ['Calm mind. Raise.']), win: L(['一切随缘。'], ['As it should be.']) },
  _: { raise: L(['加注。'], ['Raise.']), call: L(['跟。'], ['Call.']), win: L(['谢了。'], ['Thanks.']) }
}
const CHANCE: Record<Kind, number> = { allin: 0.9, raise: 0.45, fold: 0.22, call: 0.2, check: 0.12, win: 0.85 }
const BUBBLE_MS = 2700
const START = 10000

export interface Bubble {
  lines: Lines
  i: number
  at: number
}

export interface Sim {
  ids: string[]
  table: Table
  bubbles: Map<number, Bubble>
  paused: boolean
}

export function createSim(ids: string[], rng: Rng = Math.random): Sim {
  const table = new Table({ smallBlind: 50, bigBlind: 100 }, ids.length, rng)
  ids.forEach((_, i) => table.sitDown(i, START))
  const sim: Sim = { ids, table, bubbles: new Map(), paused: false }
  newHand(sim)
  return sim
}

function newHand(sim: Sim) {
  const t = sim.table
  t.seats().forEach((s, i) => s && s.stack <= 0 && t.setStack(i, START))
  t.startHand()
  sim.bubbles.clear()
}

function say(sim: Sim, seat: number, kind: Kind, now: number, rng: Rng) {
  if (rng() > CHANCE[kind]) return
  const lines = LINES[sim.ids[seat]]?.[kind] ?? LINES._[kind]
  if (lines) sim.bubbles.set(seat, { lines, i: (rng() * lines.zh.length) | 0, at: now })
}

// 下注轮结束后发下一街，最后一街结束就摊牌
function advance(t: Table) {
  t.endBettingRound()
  if (t.areBettingRoundsCompleted()) t.showdown()
}

// 推进一步，返回到下一步的毫秒数
export function step(sim: Sim, now = Date.now(), rng: Rng = Math.random): number {
  const t = sim.table
  for (const [k, b] of sim.bubbles) if (now - b.at > BUBBLE_MS) sim.bubbles.delete(k)
  let delay: number
  if (!t.isHandInProgress()) {
    newHand(sim)
    delay = 900
  } else if (!t.isBettingRoundInProgress()) {
    // 只剩一人能行动的全下局面：一街一街地发完
    advance(t)
    delay = 1200
  } else {
    const seat = t.playerToAct()
    const a = decide(t, PERSONA[sim.ids[seat]], rng)
    t.actionTaken(a.type, a.to)
    const allIn = t.seats()[seat]!.allIn
    const kind: Kind = a.type !== 'fold' && allIn ? 'allin' : a.type === 'bet' || a.type === 'raise' ? 'raise' : a.type
    say(sim, seat, kind, now, rng)
    delay = kind === 'check' ? 650 : 950
    if (t.isHandInProgress() && !t.isBettingRoundInProgress()) {
      const st = t.seats()
      const live = st.filter((s) => s && !s.out && !s.folded)
      const canAct = live.filter((s) => !s!.allIn).length
      if (live.length <= 1 || t.roundOfBetting() === 'river' || canAct > 1) advance(t)
    }
  }
  if (!t.isHandInProgress()) {
    for (const w of t.winners()) say(sim, w.seat, 'win', now, rng)
    delay = 3400
  }
  return delay
}

// 定时驱动；暂停时停在当前一步，继续时从头计时
export function run(sim: Sim, onChange: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const loop = () => {
    const d = step(sim)
    onChange()
    timer = setTimeout(loop, d)
  }
  const start = () => {
    clearTimeout(timer)
    timer = setTimeout(loop, 500)
  }
  start()
  return {
    setPaused(v: boolean) {
      sim.paused = v
      clearTimeout(timer)
      if (!v) start()
      onChange()
    },
    stop: () => clearTimeout(timer)
  }
}
