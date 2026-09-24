import { useEffect, useState } from 'react'
import { fmt } from '@/lib/format'
import { useHotkeys } from '@/lib/hotkeys'
import { go, invoke, toastError } from '@/lib/river'
import { cn } from '@/lib/utils'
import type { TableView } from '../../../../shared/types'

const cmd = (p: Promise<unknown>) => void p.catch(toastError)
const Key = ({ k, dark }: { k: string; dark?: boolean }) => (
  <span className={cn('rounded border px-1 font-mono text-[11px]', dark ? 'border-white/30 text-white/60' : 'border-input text-[#a1a1a6]')}>{k}</span>
)
const btn = 'flex flex-1 items-center justify-center gap-2 rounded-[10px] py-3 text-base whitespace-nowrap'
const primary = 'rounded-[10px] bg-foreground px-[22px] py-3 text-[15px] whitespace-nowrap text-white disabled:opacity-40'
const pill = 'rounded-full border border-input bg-white px-3 py-1 text-[13px] whitespace-nowrap hover:bg-accent'
const ALL_IN = 'linear-gradient(180deg, oklch(0.62 0.21 28), oklch(0.52 0.2 25))'

function Stalled({ s }: { s: NonNullable<TableView['stalled']> }) {
  return (
    <div className="flex items-center gap-2.5 rounded-[10px] bg-[oklch(0.97_0.02_25)] px-3.5 py-2.5 text-[13px]">
      <span className="size-1.5 shrink-0 rounded-full bg-lose" />
      <span className="min-w-0 flex-1 truncate">
        <b className="font-semibold">{s.name}</b> 的模型调用失败，牌局已停下：{s.error}
      </span>
      {s.settings && <button onClick={() => go('settings')} className={pill}>去设置</button>}
      <button onClick={() => cmd(invoke('table.retry'))} className="rounded-full bg-foreground px-3 py-1 text-[13px] whitespace-nowrap text-white">重试</button>
    </div>
  )
}

export function ActionBar({ view: v }: { view: TableView }) {
  const bb = v.bb
  const { legal: L, isTurn, defaultRaiseTo, presets, toCall } = v.hero
  const hero = v.seats[0]
  const coach = v.coach
  const clamp = (x: number) => Math.max(L.minTo, Math.min(L.maxTo, x))
  const [raiseTo, setRaiseTo] = useState(defaultRaiseTo)
  // 每个新的决策点回到主进程算好的默认加注额
  useEffect(() => {
    if (isTurn) setRaiseTo(defaultRaiseTo)
  }, [isTurn, defaultRaiseTo, v.handNo, v.street])

  const canAct = isTurn && !coach?.locked
  const canRaise = canAct && L.canRaise
  const act = (type: 'fold' | 'call' | 'raise') => cmd(invoke('table.heroAct', type === 'raise' ? { type, to: clamp(raiseTo) } : { type }))
  const canNext = v.done && (coach ? coach.canNext : true)
  const next = () => cmd(invoke(v.heroBust ? 'table.rebuy' : 'table.nextHand'))
  useHotkeys({
    f: canAct ? () => act('fold') : undefined,
    c: canAct ? () => act('call') : undefined,
    r: canRaise ? () => act('raise') : undefined,
    n: canNext && !v.heroBust ? next : undefined,
    ' ': canNext && !v.heroBust ? next : undefined
  })

  const thinking = v.seats.find((s) => s.thinking)
  const status = v.stalled
    ? '牌局已停下'
    : coach?.busy === 'ask' ? '教练回答中，牌局暂停'
      : isTurn ? (coach?.locked ? '教练正在看牌…' : `轮到你 · 需跟注 ${fmt(toCall)}`)
        : hero.folded ? `你已弃牌${thinking ? ` · ${thinking.name} 正在思考…` : ''}`
          : thinking ? `等待 ${thinking.name} 行动…` : v.runout ? '发牌中…' : ''
  const isAllIn = canRaise && raiseTo >= L.maxTo
  const callLabel = toCall === 0 ? '过牌' : toCall >= hero.stack ? `全下 ${fmt(toCall)}` : `跟注 ${fmt(toCall)}`
  const raiseLabel = isAllIn ? `全下 ${fmt(L.maxTo)}` : L.bet + L.toCall === 0 ? '下注' : '加注至'
  const ctrl = cn('flex gap-1.5', !canAct && 'pointer-events-none opacity-40')

  return (
    <div className="relative flex shrink-0 flex-col gap-3 border-t bg-[#fbfbfa] px-5 py-3.5">
      {v.stalled && <Stalled s={v.stalled} />}
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
            <span className={cn('text-[13px] whitespace-nowrap', isTurn && !coach?.locked ? 'text-blue' : 'text-muted-foreground')}>{status}</span>
            {isTurn && coach?.busy === 'speak' && (
              <button onClick={() => cmd(invoke('coach.skip'))} className={pill}>不等了</button>
            )}
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
              className={cn(btn, 'flex-[1.2] font-medium text-white', !canRaise && 'opacity-40')}
              style={{ background: isAllIn ? ALL_IN : '#1d1d1f' }}
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
          {coach?.busy === 'recap' && (
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              教练复盘中…
              <button onClick={() => cmd(invoke('coach.skip'))} className={pill}>跳过</button>
            </div>
          )}
          {coach?.busy === 'ask' && <span className="text-[13px] text-muted-foreground">教练回答中…</span>}
          {v.heroBust ? (
            <button onClick={next} disabled={!canNext} className={primary}>重新买入 {fmt(bb * 100)}</button>
          ) : (
            <button onClick={next} disabled={!canNext} className={cn(primary, 'flex items-center gap-2')}>下一手<Key k="N" dark /></button>
          )}
        </div>
      )}
    </div>
  )
}
