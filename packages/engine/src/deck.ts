import { FULL, shuffle, type Rng } from './eval'
import type { Card, Street } from './types'

// 一手牌里每一次从牌堆取牌都产生一个事件；UI 的动画和声音按同一份顺序消费。
// 事件不带牌面：对手底牌不能经由这里泄露。
export interface DealEvent {
  seq: number
  street: Street
  // 底牌的第几圈（0 或 1）；公共牌与烧牌为 0
  round: number
  // 发到哪个座位；公共牌和烧牌为 null
  seat: number | null
  // 公共牌槽位 0..4；其他为 null
  board: number | null
  burn: boolean
}

// 牌堆只负责顺序：洗牌、切牌、逐张取牌。发牌记录由 Table 负责。
export class Deck {
  private cards: Card[]

  constructor(rng: Rng) {
    this.cards = shuffle(FULL.slice(), rng)
  }

  get remaining() {
    return this.cards.length
  }

  // 切牌：把最上面 n 张移到最下面。取牌从数组尾部开始，所以顶部是尾部。
  cut(n: number) {
    const k = Math.max(0, Math.min(this.cards.length, Math.floor(n)))
    if (k === 0 || k === this.cards.length) return
    this.cards = [...this.cards.slice(-k), ...this.cards.slice(0, -k)]
  }

  draw(): Card {
    const card = this.cards.pop()
    if (!card) throw new Error('deck is empty')
    return card
  }
}
