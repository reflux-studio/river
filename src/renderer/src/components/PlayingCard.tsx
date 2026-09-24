import { disp } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Card } from '../../../shared/types'

// 字号随牌高缩放：76px 高的公共牌对应设计稿的 21/23px
export function PlayingCard({ card, w = 54, h = 76, rot = 0, className }: { card: Card; w?: number; h?: number; rot?: number; className?: string }) {
  const p = disp(card)
  return (
    <div
      className={cn('box-border flex shrink-0 flex-col justify-between rounded-lg border border-input bg-white px-[7px] py-[5px]', p.red ? 'text-lose' : 'text-foreground', className)}
      style={{ width: w, height: h, transform: rot ? `rotate(${rot}deg)` : undefined }}
    >
      <div className="leading-none font-semibold" style={{ fontSize: Math.round(h * 0.28) }}>{p.r}</div>
      <div className="self-end leading-none" style={{ fontSize: Math.round(h * 0.3) }}>{p.s}</div>
    </div>
  )
}

export function EmptyCard({ w = 54, h = 76 }: { w?: number; h?: number }) {
  return <div className="box-border shrink-0 rounded-lg border-[1.5px] border-dashed border-[#dededa]" style={{ width: w, height: h }} />
}

export function CardBack({ rot = 0, className }: { rot?: number; className?: string }) {
  return (
    <div
      className={cn('box-border flex h-[50px] w-9 items-center justify-center rounded-md border border-[#e0e0dc] bg-[#f0f0ee]', className)}
      style={{ transform: `rotate(${rot}deg)` }}
    >
      <div className="size-2 rotate-45 border-[1.5px] border-[#c4c4c0]" />
    </div>
  )
}
