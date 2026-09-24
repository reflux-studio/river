import { useEffect, useState } from 'react'
import { fmt } from '@/lib/format'
import { useHotkeys } from '@/lib/hotkeys'
import { invoke, toastError } from '@/lib/river'
import { cn } from '@/lib/utils'
import type { TableView } from '../../../../shared/types'

const cmd = (p: Promise<unknown>) => void p.catch(toastError)
const Key = ({ k, dark }: { k: string; dark?: boolean }) => (
  <span className={cn('rounded border px-1 font-mono text-[11px]', dark ? 'border-[#48484a] text-[#8e8e93]' : 'border-input text-[#a1a1a6]')}>{k}</span>
)
const btn = 'flex flex-1 items-center justify-center gap-2 rounded-[10px] py-3 text-base whitespace-nowrap'
const primary = 'rounded-[10px] bg-foreground px-[22px] py-3 text-[15px] whitespace-nowrap text-white'

export function ActionBar({ view: v }: { view: TableView }) {
  const bb = v.bb
  const { legal: L, isTurn, defaultRaiseTo, presets, toCall } = v.hero
  const hero = v.seats[0]
  const clamp = (x: number) => Math.max(L.minTo, Math.min(L.maxTo, x))
  const [raiseTo, setRaiseTo] = useState(defaultRaiseTo)
  // 每个新的决策点回到主进程算好的默认加注额
  useEffect(() => {
    if (isTurn) setRaiseTo(defaultRaiseTo)
  }, [isTurn, defaultRaiseTo, v.handNo, v.street])

  const canAct = isTurn && !v.paused
  const canRaise = canAct && L.canRaise
  const act = (type: 'fold' | 'call' | 'raise') => cmd(invoke('table.heroAct', type === 'raise' ? { type, to: clamp(raiseTo) } : { type }))
  const next = () => cmd(invoke('table.nextHand'))
  const canNext = v.done && !v.heroBust
  useHotkeys({
    f: canAct ? () => act('fold') : undefined,
    c: canAct ? () => act('call') : undefined,
    r: canRaise ? () => act('raise') : undefined,
    n: canNext ? next : undefined,
    ' ': canNext ? next : undefined
  })

  const thinking = v.seats.find((s) => s.thinking)
  const status = isTurn
    ? v.paused ? '牌局已暂停' : `轮到你 · 需跟注 ${fmt(toCall)}`
    : hero.folded ? `你已弃牌${thinking ? ` · ${thinking.name} 正在思考…` : ''}`
      : thinking ? `等待 ${thinking.name} 行动…` : v.runout ? '发牌中…' : v.paused ? '牌局已暂停' : ''
  const currentBet = L.bet + L.toCall
  const callLabel = toCall === 0 ? '过牌' : toCall >= hero.stack ? `全下 ${fmt(toCall)}` : `跟注 ${fmt(toCall)}`
  const raiseLabel = isTurn && raiseTo >= L.maxTo ? '全下' : currentBet === 0 ? '下注' : '加注至'
  const ctrl = cn('flex gap-1.5', !canAct && 'pointer-events-none opacity-40')

  return (
    <div className="relative flex shrink-0 flex-col gap-3 border-t bg-background px-5 py-3.5">
      {!v.done ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-1.5">
            <div className={ctrl}>
              {presets.map((o) => (
                <button
                  key={o.label}
                  onClick={() => setRaiseTo(o.to)}
                  className={cn('rounded-lg border border-input px-3 py-[5px] text-[13px] whitespace-nowrap', raiseTo === o.to ? 'bg-[#ececea] font-semibold' : 'bg-white')}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <div className="flex-1" />
            <span className={cn('text-[13px] whitespace-nowrap', isTurn ? 'text-blue' : 'text-muted-foreground')}>{status}</span>
          </div>
          <div className={cn(ctrl, 'items-stretch gap-2')}>
            <button onClick={() => act('fold')} className={cn(btn, 'border border-input bg-white hover:bg-accent')}>
              弃牌<Key k="F" />
            </button>
            <button onClick={() => act('call')} className={cn(btn, 'border border-input bg-white hover:bg-accent')}>
              {callLabel}<Key k="C" />
            </button>
            <div className={cn('flex items-center overflow-hidden rounded-[10px] border border-input bg-white', !canRaise && 'opacity-40')}>
              <button onClick={() => setRaiseTo((x) => clamp(x - bb))} className="px-3 text-lg text-label">−</button>
              <div className="min-w-[76px] px-1.5 text-center text-base font-semibold">{canRaise ? fmt(raiseTo) : '—'}</div>
              <button onClick={() => setRaiseTo((x) => clamp(x + bb))} className="px-3 text-lg text-label">+</button>
            </div>
            <button
              onClick={() => act('raise')}
              disabled={!canRaise}
              className={cn(btn, 'flex-[1.2] bg-foreground font-medium text-white', !canRaise && 'opacity-40')}
            >
              {raiseLabel}<Key k="R" dark />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex min-h-24 items-center gap-3">
          <div className="flex flex-1 flex-col gap-1">
            <span className={cn('text-lg font-semibold', v.result?.heroWon ? 'text-win' : 'text-foreground')}>{v.result?.text}</span>
            <span className="text-[13px] text-muted-foreground">{v.result?.sub}</span>
          </div>
          {v.heroBust ? (
            <button onClick={() => cmd(invoke('table.rebuy'))} className={primary}>重新买入 {fmt(bb * 100)}</button>
          ) : (
            <button onClick={next} className={cn(primary, 'flex items-center gap-2')}>下一手<Key k="N" dark /></button>
          )}
        </div>
      )}
      {isTurn && v.paused && (
        <div className="absolute inset-0 flex items-center justify-center gap-3 bg-[rgba(251,251,250,0.86)]">
          <span className="text-sm text-[#3a3a3c]">教练暂停了牌局，先看看右侧的提醒</span>
          <button onClick={() => cmd(invoke('table.resume'))} className="rounded-full bg-foreground px-4 py-2 text-sm text-white">我看完了，继续</button>
        </div>
      )}
    </div>
  )
}
