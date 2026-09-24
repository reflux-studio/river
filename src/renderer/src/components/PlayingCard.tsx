import { useRiver } from '@/lib/river'
import { backOf } from '@/lib/felt'
import { cn } from '@/lib/utils'
import type { Card } from '../../../shared/types'

// 花色矢量，照搬设计稿
const SUIT: Record<string, string> = {
  s: 'M12 1.8C9.2 5.3 3 9.6 3 14.2c0 2.7 2.1 4.6 4.5 4.6 1.6 0 2.9-.8 3.6-1.9-.2 2.2-1 3.9-2.6 5.3h7c-1.6-1.4-2.4-3.1-2.6-5.3.7 1.1 2 1.9 3.6 1.9 2.4 0 4.5-1.9 4.5-4.6 0-4.6-6.2-8.9-9-12.4z',
  h: 'M12 21.6C10.3 20 2.5 14.2 2.5 8.4 2.5 5.3 4.8 3 7.6 3c1.9 0 3.5 1 4.4 2.6C12.9 4 14.5 3 16.4 3c2.8 0 5.1 2.3 5.1 5.4 0 5.8-7.8 11.6-9.5 13.2z',
  d: 'M12 1.5l8 10.5-8 10.5-8-10.5z',
  c: 'M12 2.2a4.3 4.3 0 0 1 3.5 6.8 4.3 4.3 0 1 1-2.4 7.6c.2 2.4 1 4.2 2.6 5.9H8.3c1.6-1.7 2.4-3.5 2.6-5.9A4.3 4.3 0 1 1 8.5 9 4.3 4.3 0 0 1 12 2.2z'
}

const rank = (c: Card) => (c[0] === 'T' ? '10' : c[0])
const red = (c: Card) => c[1] === 'h' || c[1] === 'd'

export function Suit({ c, size, className }: { c: Card; size: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn('block', className)} style={{ width: size, height: size }}>
      <path d={SUIT[c[1]]} fill="currentColor" />
    </svg>
  )
}

// 大牌面：左上角点数与小花色，右下角大花色（公共牌 56×80、玩家 60×84、对手 44×62、回放 50×70）
export function PlayingCard({ card, w = 56, h = 80, rot = 0, className, style }: { card: Card; w?: number; h?: number; rot?: number; className?: string; style?: React.CSSProperties }) {
  const k = h / 80
  return (
    <div
      className={cn('relative box-border shrink-0 rounded-[7px] bg-white shadow-[0_1px_0_rgba(0,0,0,0.08),0_5px_12px_rgba(0,0,0,0.24)]', red(card) ? 'text-lose' : 'text-foreground', className)}
      style={{ width: w, height: h, borderRadius: Math.round(7 * k), transform: rot ? `rotate(${rot}deg)` : undefined, ...style }}
    >
      <div className="absolute flex flex-col items-center" style={{ left: 6 * k, top: 6 * k, gap: 3 * k }}>
        <span className="leading-none font-bold tracking-[-0.06em]" style={{ fontSize: Math.round(21 * k) }}>{rank(card)}</span>
        <Suit c={card} size={Math.round(13 * k)} />
      </div>
      <div className="absolute" style={{ right: 6 * k, bottom: 7 * k }}>
        <Suit c={card} size={Math.round(26 * k)} />
      </div>
    </div>
  )
}

// 小牌面：公屏、教练文字、列表里用
export function MiniCard({ card, w = 18, h = 25 }: { card: Card; w?: number; h?: number }) {
  const k = h / 25
  return (
    <span
      className={cn('inline-flex shrink-0 flex-col items-center justify-center gap-px border border-[#dcdcd8] bg-white align-[-7px]', red(card) ? 'text-lose' : 'text-foreground')}
      style={{ width: w, height: h, borderRadius: 3.5 * k }}
    >
      <span className="leading-none font-bold tracking-[-0.05em]" style={{ fontSize: 10.5 * k }}>{rank(card)}</span>
      <Suit c={card} size={9 * k} />
    </span>
  )
}

export function MiniCards({ cards, w, h }: { cards: Card[]; w?: number; h?: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {cards.map((c) => <MiniCard key={c} card={c} w={w} h={h} />)}
    </span>
  )
}

export function EmptyCard({ w = 56, h = 80, border }: { w?: number; h?: number; border: string }) {
  return <div className="box-border shrink-0 rounded-[7px] border-[1.5px] border-dashed" style={{ width: w, height: h, borderColor: border }} />
}

export function CardBack({ rot = 0, className }: { rot?: number; className?: string }) {
  const back = useRiver((s) => s.settings.back)
  return (
    <div
      className={cn('box-border h-12 w-[34px] rounded-[5px] bg-white p-[2.5px] shadow-[0_2px_6px_rgba(0,0,0,0.28)]', className)}
      style={{ transform: `rotate(${rot}deg)` }}
    >
      <div className="size-full rounded-[3px]" style={{ background: backOf(back) }} />
    </div>
  )
}

// 文本里的“A♠”渲染成小牌面
const CARD_RE = /(10|[2-9TJQKA])([♠♥♦♣])️?/g
const SYM: Record<string, string> = { '♠': 's', '♥': 'h', '♦': 'd', '♣': 'c' }
export function RichText({ text }: { text: string }) {
  const out: React.ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(CARD_RE)) {
    if (m.index! > last) out.push(text.slice(last, m.index))
    out.push(<MiniCard key={m.index} card={(m[1] === '10' ? 'T' : m[1]) + SYM[m[2]]} />)
    last = m.index! + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return <>{out}</>
}
