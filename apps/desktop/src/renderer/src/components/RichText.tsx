import { InlineCard } from '@river/ui'

// 文本里的“A♠”渲染成小牌面
const CARD_RE = /(10|[2-9TJQKA])([♠♥♦♣])️?/g
const SYM: Record<string, string> = { '♠': 's', '♥': 'h', '♦': 'd', '♣': 'c' }

export function RichText({ text }: { text: string }) {
  const out: React.ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(CARD_RE)) {
    // 两张牌之间只隔空白时不留空格，像一手牌那样挨着
    const gap = text.slice(last, m.index)
    if (gap && !(last > 0 && !gap.trim())) out.push(gap)
    out.push(<InlineCard key={m.index} card={(m[1] === '10' ? 'T' : m[1]) + SYM[m[2]]} />)
    last = m.index! + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return <>{out}</>
}
