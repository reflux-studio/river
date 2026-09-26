import { MiniCards } from '@river/ui'
import { useEffect, useRef, useState } from 'react'
import { RichText } from '@/components/RichText'
import { Segmented } from '@/components/Segmented'
import { Switch } from '@/components/ui/switch'
import { netColor, signed } from '@/lib/format'
import { askCoach, invoke, toastError, updateSettings, useRiver, useT } from '@/lib/river'
import { cn } from '@/lib/utils'
import type { CoachEntry, Recap, Settings, TableView } from '../../../../shared/types'

export function ProbPanel({ nums }: { nums: NonNullable<TableView['nums']> }) {
  const t = useT()
  const c = t.desktop.coachPanel
  // 只并列事实：胜率按随机手牌估算，与所需胜率口径不同，不做 ±EV 判断
  const stats = [
    [c.need, nums.need === 0 ? '—' : (nums.need * 100).toFixed(1) + '%'],
    [c.cat, t.poker.hand[nums.handCat]],
    [c.outs, nums.outs == null ? '—' : String(nums.outs)]
  ]
  return (
    <div className="flex flex-col gap-2.5 rounded-xl bg-topbar p-3.5">
      <span className="text-[13px] text-label">{c.eq}</span>
      <span className="text-[30px] leading-none font-semibold tracking-[-0.02em]">{Math.round(nums.eq * 100)}%</span>
      <div className="relative h-2 rounded-full bg-[#e8e8e5]">
        <div className="absolute inset-y-0 left-0 rounded-full bg-blue" style={{ width: `${Math.min(100, nums.eq * 100)}%` }} />
      </div>
      <div className="grid grid-cols-3 gap-1.5 text-xs text-muted-foreground">
        {stats.map(([l, v]) => (
          <div key={l} className="flex flex-col">
            <span>{l}</span>
            <span className="text-[15px] font-semibold text-foreground">{v}</span>
          </div>
        ))}
      </div>
      <div className="text-xs leading-normal text-muted-foreground">
        {c.probNote}{nums.stale && ' · ' + c.stale}
      </div>
    </div>
  )
}

const DOT = { good: 'oklch(0.55 0.14 155)', improve: 'oklch(0.72 0.14 70)', tip: 'oklch(0.6 0.17 255)' }

export function RecapRows({ r, big }: { r: Recap; big?: boolean }) {
  const l = useT().desktop.coachPanel.recapRows
  const rows: [string, string, string][] = [[l.good, DOT.good, r.good], [l.improve, DOT.improve, r.improve], [l.tip, DOT.tip, r.tip]]
  return (
    <div className="flex flex-col gap-2.5">
      <div className={cn('leading-normal font-semibold [text-wrap:pretty]', big ? 'text-base' : 'text-sm')}>
        <RichText text={r.headline} />
      </div>
      {rows.map(([l, dot, t]) => (
        <div key={l} className={cn('flex gap-2', big ? 'text-sm leading-[1.65]' : 'text-[13px] leading-[1.6]')}>
          <span className={cn('flex shrink-0 items-center gap-[5px] font-medium text-subtle', big ? 'h-[23px] w-[76px]' : 'h-[21px] w-[68px]')}>
            <span className="size-1.5 rounded-full" style={{ background: dot }} />
            {l}
          </span>
          <span className="min-w-0 flex-1 [text-wrap:pretty]"><RichText text={t} /></span>
        </div>
      ))}
    </div>
  )
}

function RetryButton({ id }: { id: string }) {
  const can = useRiver((s) => s.view?.coach?.retry === id)
  const t = useT()
  if (!can) return null
  return <button onClick={() => invoke('coach.retry').catch(toastError)} className="rounded-full border border-input bg-white px-2.5 py-0.5 text-foreground hover:bg-accent">{t.desktop.btn.retry}</button>
}

function RecapCard({ e }: { e: CoachEntry }) {
  const persona = useRiver((s) => s.settings.coachPersona)
  const t = useT()
  const c = t.desktop.coachPanel
  const coachName = t.prompt.coaches[persona].n
  return (
    <div className="shrink-0 overflow-hidden rounded-[14px] border bg-white">
      <div className="flex flex-col gap-2 bg-topbar px-3 py-2.5">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-semibold">{c.recapTitle(e.handNo)}</span>
          <div className="flex-1" />
          {e.hand && <span className={cn('text-[13px] font-semibold', netColor(e.hand.net))}>{signed(e.hand.net)}</span>}
        </div>
        {e.hand && (
          <div className="flex items-center gap-2">
            <MiniCards cards={e.hand.hero} w={20} h={28} />
            {e.hand.board.length > 0 && (
              <>
                <span className="h-[18px] w-px bg-input" />
                <MiniCards cards={e.hand.board} w={20} h={28} />
              </>
            )}
          </div>
        )}
      </div>
      <div className="p-3">
        {e.status === 'pending' && <span className="text-[13px] text-muted-foreground">{c.recapPending}</span>}
        {e.status === 'skipped' && <span className="text-[13px] text-muted-foreground">{c.recapSkipped}</span>}
        {e.status === 'failed' && (
          <div className="flex items-center gap-2 text-[13px] text-lose">
            <span className="flex-1">{c.recapFailed(e.error ?? '')}</span>
            <RetryButton id={e.id} />
          </div>
        )}
        {e.status === 'done' && e.recap && (
          <div className="flex flex-col gap-2.5">
            <RecapRows r={e.recap} />
            <span className="text-[11px] text-[#a1a1a6]">{coachName}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function Entry({ e }: { e: CoachEntry }) {
  const c = useT().desktop.coachPanel
  if (e.kind === 'recap') return <RecapCard e={e} />
  if (e.kind === 'user')
    return <div className="max-w-[90%] self-end rounded-xl bg-foreground px-3 py-[9px] text-sm leading-[1.7] whitespace-pre-wrap text-white">{e.text}</div>
  const failed = e.status === 'failed'
  const text = e.text || (e.status === 'pending' ? (e.kind === 'speak' ? c.looking : '…') : '')
  return (
    <div className={cn('flex flex-col gap-1.5 rounded-xl px-3.5 py-3', e.kind === 'speak' ? 'bg-[oklch(0.97_0.015_255)]' : 'max-w-[90%] self-start bg-[#f3f3f1]')}>
      {e.kind === 'speak' && <div className="text-xs font-semibold text-[oklch(0.5_0.15_255)]">{c.speakHead(e.handNo)}</div>}
      {text && <div className={cn('text-sm leading-[1.7] whitespace-pre-wrap [text-wrap:pretty]', !e.text && 'text-muted-foreground')}><RichText text={text} /></div>}
      {e.status === 'skipped' && <span className="text-[11px] text-muted-foreground">{c.skipped}</span>}
      {failed && (
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <span className="flex-1">{c.offline(e.error ?? '')}</span>
          {e.kind === 'speak' && <RetryButton id={e.id} />}
        </div>
      )}
    </div>
  )
}

function useAutoScroll(dep: unknown) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [dep])
  return ref
}

// 自由局：只有概率面板（A3）
function FreePanel({ view: v }: { view: TableView }) {
  const c = useT().desktop.coachPanel
  return (
    <aside className="flex min-h-0 w-[264px] shrink-0 flex-col border-l min-[1100px]:w-[296px]">
      <div className="border-b border-[#f0f0ee] px-4 py-3 text-[15px] font-semibold">{c.prob}</div>
      <div className="flex flex-col gap-3.5 overflow-auto px-4 py-3.5">
        {v.nums ? <ProbPanel nums={v.nums} /> : <div className="text-[13px] text-muted-foreground">{c.probEmpty}</div>}
        <div className="text-xs leading-[1.6] text-muted-foreground">{c.freeNote}</div>
      </div>
    </aside>
  )
}

export function CoachPanel({ view: v }: { view: TableView }) {
  const st = useRiver((s) => s.settings)
  const coach = useRiver((s) => s.coach)
  const t = useT()
  const c = t.desktop.coachPanel
  const [input, setInput] = useState('')
  const threadRef = useAutoScroll(coach)
  if (v.mode === 'free') return <FreePanel view={v} />

  const busy = v.coach?.busy ?? null
  const set = (patch: Partial<Settings>) => void updateSettings(patch)
  const ask = (text: string) => {
    const q = text.trim()
    if (!q || busy) return
    setInput('')
    void askCoach(q)
  }

  return (
    <aside className="flex min-h-0 w-[296px] shrink-0 flex-col border-l min-[1100px]:w-[344px]">
      <div className="flex items-center gap-2.5 border-b border-[#f0f0ee] px-4 py-2.5">
        <div className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-[oklch(0.92_0.045_155)] text-xs font-semibold">{c.ini}</div>
        <button
          onClick={() => set({ coachPersona: ((st.coachPersona + 1) % t.prompt.coaches.length) as Settings['coachPersona'] })}
          className="flex min-w-0 flex-1 flex-col text-left"
        >
          <span className="text-sm font-semibold whitespace-nowrap">{c.coachName(t.prompt.coaches[st.coachPersona].n)}</span>
          <span className="text-xs whitespace-nowrap text-muted-foreground">{v.guided ? c.guidedSub : c.coachSub}</span>
        </button>
      </div>
      <div className="px-4 pt-2.5">
        <Segmented
          full
          value={st.level}
          options={[{ label: c.levels.novice, value: 'novice' }, { label: c.levels.pro, value: 'pro' }]}
          onChange={(level) => set({ level })}
        />
      </div>
      {/* 概率面板固定在讲解区外：教练每步都说，放进滚动区会被顶出视野 */}
      {v.nums && (
        <div className="px-4 pt-3">
          {st.hard ? (
            <div className="rounded-[10px] border border-dashed border-input px-3 py-2.5 text-[13px] text-muted-foreground">{c.hardHidden}</div>
          ) : (
            <ProbPanel nums={v.nums} />
          )}
        </div>
      )}
      <div ref={threadRef} className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto px-4 py-3.5">
        {coach.map((e) => <Entry key={e.id} e={e} />)}
        {!coach.length && (
          <div className="text-[13px] leading-[1.6] text-muted-foreground">
            {c.empty}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2.5 border-t px-4 pt-3 pb-4">
        <div className="flex flex-wrap gap-1.5">
          {c.quick[st.level].map((q) => (
            <button key={q} disabled={!!busy} onClick={() => ask(q)} className="rounded-full border px-2.5 py-1 text-xs text-label hover:bg-accent disabled:opacity-40">{q}</button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            // 输入法组合中的回车是选词，不是发送
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && ask(input)}
            placeholder={busy ? c.askWait : c.askPh}
            className="min-w-0 flex-1 rounded-[10px] border border-input px-3 py-[9px] text-sm outline-none"
          />
          <button onClick={() => ask(input)} disabled={!!busy} className="rounded-[10px] bg-foreground px-3 py-[9px] text-sm whitespace-nowrap text-white disabled:opacity-40">
            {c.askBtn}
          </button>
        </div>
        <div className="flex items-center gap-2 text-[13px] text-label">
          <span className="flex-1">{c.hardToggle}</span>
          <Switch checked={st.hard} onCheckedChange={(hard) => set({ hard })} />
        </div>
      </div>
    </aside>
  )
}
