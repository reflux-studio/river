import { ActionControls } from '@river/ui'
import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { fmt } from '@/lib/format'
import { useHotkeys } from '@/lib/hotkeys'
import { go, invoke, toastError, useT } from '@/lib/river'
import { cn } from '@/lib/utils'
import type { TableView } from '../../../../shared/types'

const cmd = (p: Promise<unknown>) => void p.catch(toastError)
const Key = ({ k, dark }: { k: string; dark?: boolean }) => (
  <span
    className={cn(
      'rounded border px-1 font-mono text-[11px]',
      dark ? 'border-white/30 text-white/60' : 'border-input text-[#a1a1a6]'
    )}
  >
    {k}
  </span>
)
const primary =
  'rounded-[10px] bg-foreground px-[22px] py-3 text-[15px] whitespace-nowrap text-white disabled:opacity-40'
const pill = 'rounded-full border border-input bg-white px-3 py-1 text-[13px] whitespace-nowrap hover:bg-accent'

function Stalled({ s }: { s: NonNullable<TableView['stalled']> }) {
  const t = useT()
  return (
    <div className="flex items-center gap-2.5 rounded-[10px] bg-[oklch(0.97_0.02_25)] px-3.5 py-2.5 text-[13px]">
      <span className="size-1.5 shrink-0 rounded-full bg-lose" />
      <span className="min-w-0 flex-1 truncate">
        <b className="font-semibold">{s.name}</b>
        {t.desktop.action.stalled(s.error)}
      </span>
      {s.settings && (
        <button onClick={() => go('settings')} className={pill}>
          {t.desktop.btn.goSettings}
        </button>
      )}
      <button
        onClick={() => cmd(invoke('table.retry'))}
        className="rounded-full bg-foreground px-3 py-1 text-[13px] whitespace-nowrap text-white"
      >
        {t.desktop.btn.retry}
      </button>
    </div>
  )
}

export function ActionBar({ view: v }: { view: TableView }) {
  const bb = v.bb
  const { legal: L, isTurn, defaultRaiseTo, presets, toCall } = v.hero
  const hero = v.seats[0]
  const coach = v.coach
  const t = useT()
  const a = t.desktop.action
  const pa = t.poker.act
  const clamp = (x: number) => Math.max(L.minTo, Math.min(L.maxTo, x))
  const [raiseTo, setRaiseTo] = useState(defaultRaiseTo)
  // 每个新的决策点回到主进程算好的默认加注额
  useEffect(() => {
    if (isTurn) setRaiseTo(defaultRaiseTo)
  }, [isTurn, defaultRaiseTo, v.handNo, v.street])
  const [draft, setDraft] = useState(() => fmt(raiseTo))
  useEffect(() => setDraft(fmt(raiseTo)), [raiseTo])
  const commit = () => {
    const raw = draft.replace(/[,\s]/g, '')
    const n = Number(raw)
    const to = raw && Number.isFinite(n) ? clamp(Math.round(n)) : raiseTo
    setRaiseTo(to)
    // raiseTo 未变时上面的 effect 不会触发，这里要自己把输入框改回规范格式
    setDraft(fmt(to))
  }

  const canAct = v.hero.canAct
  const canRaise = canAct && L.canRaise
  const act = (type: 'fold' | 'call' | 'raise') =>
    cmd(invoke('table.heroAct', type === 'raise' ? { type, to: clamp(raiseTo) } : { type }))
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
    ? a.stopped
    : coach?.busy === 'ask'
      ? a.coachAnswering
      : isTurn
        ? coach?.locked
          ? t.desktop.coachPanel.looking
          : !canAct
            ? a.dealing
            : a.yourTurn(fmt(toCall))
        : hero.folded
          ? a.youFolded + (thinking ? a.thinking(thinking.name) : '')
          : thinking
            ? a.waiting(thinking.name)
            : v.runout
              ? a.dealing
              : ''
  const isAllIn = canRaise && raiseTo >= L.maxTo
  const callLabel = toCall === 0 ? pa.check : `${toCall >= hero.stack ? pa.allin : pa.call} ${fmt(toCall)}`
  const raiseLabel = isAllIn ? `${pa.allin} ${fmt(L.maxTo)}` : L.bet + L.toCall === 0 ? pa.bet : pa.raiseTo
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
                  className={cn(
                    'rounded-lg border border-input px-3 py-[5px] text-[13px] whitespace-nowrap',
                    raiseTo === o.to ? 'bg-[#ececea] font-semibold' : 'bg-white'
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <div className="flex-1" />
            <span
              className={cn(
                'text-[13px] whitespace-nowrap',
                isTurn && !coach?.locked ? 'text-blue' : 'text-muted-foreground'
              )}
            >
              {status}
            </span>
            {isTurn && coach?.busy === 'speak' && (
              <button onClick={() => cmd(invoke('coach.skip'))} className={pill}>
                {a.skipWait}
              </button>
            )}
          </div>
          <ActionControls
            canAct={canAct}
            canRaise={canRaise}
            draft={draft}
            isAllIn={isAllIn}
            callLabel={callLabel}
            raiseLabel={raiseLabel}
            foldLabel={pa.fold}
            onFold={() => act('fold')}
            onCall={() => act('call')}
            onRaise={() => act('raise')}
            onStep={(direction) => setRaiseTo((x) => clamp(x + direction * bb))}
            onDraft={setDraft}
            onCommit={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur()
              else if (e.key === 'Escape') {
                flushSync(() => setDraft(fmt(raiseTo)))
                e.currentTarget.blur()
              }
            }}
          />
        </div>
      ) : (
        <div className="flex min-h-24 items-center gap-3">
          <div className="flex flex-1 flex-col gap-1">
            <span className={cn('text-lg font-semibold', v.result?.heroWon ? 'text-win' : 'text-foreground')}>
              {v.result?.text}
            </span>
            <span className="text-[13px] text-muted-foreground">{v.result?.sub}</span>
          </div>
          {coach?.busy === 'recap' && (
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              {a.recapping}
              <button onClick={() => cmd(invoke('coach.skip'))} className={pill}>
                {a.skip}
              </button>
            </div>
          )}
          {coach?.busy === 'ask' && <span className="text-[13px] text-muted-foreground">{a.answering}</span>}
          {v.heroBust ? (
            <button onClick={next} disabled={!canNext} className={primary}>
              {a.rebuy(fmt(bb * 100))}
            </button>
          ) : (
            <button onClick={next} disabled={!canNext} className={cn(primary, 'flex items-center gap-2')}>
              {a.next}
              <Key k="N" dark />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
