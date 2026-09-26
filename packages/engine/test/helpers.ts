import { FULL, Table, type ActionType } from '../src'

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const cards = (s: string) => s.split(' ')

// 造一个随机数序列：构造时按钮落在 button 前一位（startHand 再前移一位），洗牌结果使发牌顺序为
// 每人第一张、每人第二张（按座位号），然后 烧 翻翻翻 烧 转 烧 河
export function rigged(n: number, button: number, holes: string[], board = '') {
  const want: string[] = []
  const h = holes.map(cards)
  for (let r = 0; r < 2; r++) for (const x of h) if (x.length) want.push(x[r])
  const b = board ? cards(board) : []
  const rest = FULL.filter((c) => !want.includes(c) && !b.includes(c))
  const burn = () => rest.pop()!
  if (b.length) want.push(burn(), b[0], b[1], b[2], burn(), b[3], burn(), b[4])
  // pop 从尾部取：最先发的牌放在最后
  const deck = [...rest, ...want.reverse()]
  const out = [(((button - 1 + n) % n) + 0.5) / n]
  const a = FULL.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = a.indexOf(deck[i])
    out.push((j + 0.5) / (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  let k = 0
  return () => out[k++] ?? 0.5
}

export function table(stacks: number[], o: { sb?: number; bb?: number; button?: number; holes?: string[]; board?: string; rng?: () => number } = {}) {
  const n = stacks.length
  const rng = o.rng ?? rigged(n, o.button ?? 0, o.holes ?? stacks.map(() => ''), o.board)
  const t = new Table({ smallBlind: o.sb ?? 5, bigBlind: o.bb ?? 10 }, n, rng)
  stacks.forEach((s, i) => t.sitDown(i, s))
  t.startHand()
  return t
}

// 下注轮结束后逐街推进到摊牌
export function finish(t: Table) {
  while (t.isHandInProgress()) {
    if (t.isBettingRoundInProgress()) throw new Error('someone still needs to act')
    t.endBettingRound()
    if (t.areBettingRoundsCompleted()) t.showdown()
  }
}

// 剩下的人每街都过牌
export function checkDown(t: Table) {
  while (t.isHandInProgress()) {
    if (t.isBettingRoundInProgress()) t.actionTaken('check')
    else {
      t.endBettingRound()
      if (t.areBettingRoundsCompleted()) t.showdown()
    }
  }
}

export const act = (t: Table, a: ActionType, to?: number) => {
  const seat = t.playerToAct()
  t.actionTaken(a, to)
  return seat
}
export const stacks = (t: Table) => t.seats().map((s) => s!.stack)
