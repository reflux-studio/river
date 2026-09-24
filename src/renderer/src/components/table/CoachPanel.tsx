import { useEffect, useRef, useState } from 'react'
import { Segmented } from '@/components/Segmented'
import { Switch } from '@/components/ui/switch'
import { askCoach, configured, go, invoke, toastError, updateSettings, useRiver, type CoachItem } from '@/lib/river'
import { cn } from '@/lib/utils'
import { COACHES } from '../../../../shared/personas'
import type { Settings, TableView } from '../../../../shared/types'

const QUICK = {
  novice: ['现在该怎么打？', '对手可能有什么牌？', '什么是底池赔率？'],
  pro: ['对手的范围？', '加注还是平跟？', '河牌怎么计划？']
}
const FAIL: Record<string, string> = {
  failed: '教练暂时没连上，稍后再问',
  not_configured: '还没有配置教练模型',
  breaker: '教练模型连续失败，已停用'
}

function ProbPanel({ nums }: { nums: NonNullable<TableView['nums']> }) {
  // 所需胜率为 0 当且仅当无需跟注
  const free = nums.need === 0
  const good = free || nums.eq >= nums.need
  const stats = [['当前牌型', nums.handName], ['出路', nums.outs == null ? '—' : String(nums.outs)], ['规则建议', nums.sugg]]
  return (
    <div className="flex flex-col gap-2.5 rounded-xl bg-topbar p-3.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] text-label">胜率 vs 所需胜率</span>
        <span className={cn('text-[13px] font-semibold', good ? 'text-win' : 'text-lose')}>{free ? '可免费看牌' : good ? '跟注 +EV' : '跟注 −EV'}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[30px] font-semibold tracking-[-0.02em]">{Math.round(nums.eq * 100)}%</span>
        <span className="text-sm text-muted-foreground">/ {free ? '0%' : (nums.need * 100).toFixed(1) + '%'}</span>
      </div>
      <div className="relative h-2 rounded-full bg-[#e8e8e5]">
        <div className="absolute inset-y-0 left-0 rounded-full bg-blue" style={{ width: `${Math.min(100, nums.eq * 100)}%` }} />
        <div className="absolute -top-1 h-4 w-0.5 bg-foreground" style={{ left: `${nums.need * 100}%` }} />
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
        本地计算 · 胜率按对手随机手牌估算{nums.stale && ' · 数据来自你上一次决策'}
      </div>
    </div>
  )
}

function Bubble({ c }: { c: CoachItem }) {
  const user = c.role === 'user'
  const failed = c.error && c.error !== 'interrupted'
  const text = c.text || (failed ? FAIL[c.error!] : '')
  if (!text) return null
  return (
    <div className={cn('flex max-w-[90%] flex-col gap-1', user ? 'items-end self-end' : 'items-start self-start')}>
      <div
        className={cn(
          'rounded-xl px-3 py-[9px] text-sm leading-[1.6] whitespace-pre-wrap [text-wrap:pretty]',
          user ? 'bg-foreground text-white' : 'bg-[#f3f3f1]',
          failed && !c.text && 'text-muted-foreground'
        )}
      >
        {text}
      </div>
      {c.interrupted && <span className="text-[11px] text-muted-foreground">已中断</span>}
      {failed && c.text && <span className="text-[11px] text-muted-foreground">{FAIL[c.error!]}</span>}
    </div>
  )
}

export function CoachPanel({ view: v }: { view: TableView }) {
  const st = useRiver((s) => s.settings)
  const coach = useRiver((s) => s.coach)
  const alert = v.alert
  const ready = useRiver((s) => configured(s, 'coach'))
  const [input, setInput] = useState('')
  const threadRef = useRef<HTMLDivElement>(null)
  const loading = v.coachLoading && !coach.some((c) => c.pending && c.text)
  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [coach, loading, alert?.message])

  const set = (patch: Partial<Settings>) => void updateSettings(patch)
  const ask = (text: string) => {
    const t = text.trim()
    if (!t) return
    setInput('')
    askCoach(t).catch(toastError)
  }

  return (
    <aside className="flex min-h-0 w-[296px] shrink-0 flex-col border-l min-[1100px]:w-[344px]">
      <div className="flex items-center gap-2.5 border-b border-[#f0f0ee] px-4 py-2.5">
        <div className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-[oklch(0.92_0.045_155)] text-xs font-semibold">师</div>
        <button
          onClick={() => set({ coachPersona: ((st.coachPersona + 1) % COACHES.length) as Settings['coachPersona'] })}
          className="flex min-w-0 flex-1 flex-col text-left"
        >
          <span className="text-sm font-semibold whitespace-nowrap">教练 · {COACHES[st.coachPersona].n} ▾</span>
          <span className="text-xs whitespace-nowrap text-muted-foreground">
            {st.coachOn ? '主动提醒已开启 · 点名字切换人设' : '主动提醒已关闭 · 仍可随时提问'}
          </span>
        </button>
        <Switch checked={st.coachOn} onCheckedChange={(coachOn) => set({ coachOn })} />
      </div>
      <div className="px-4 pt-2.5">
        <Segmented
          full
          value={st.level}
          options={[{ label: '新手讲解', value: 'novice' }, { label: '进阶分析', value: 'pro' }]}
          onChange={(level) => set({ level })}
        />
      </div>
      <div ref={threadRef} className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto px-4 py-3.5">
        {v.paused && (
          <div className="flex items-center gap-2.5 rounded-[10px] bg-foreground px-3 py-2.5 text-[13px] text-white">
            <span className="size-[7px] shrink-0 rounded-full bg-[oklch(0.8_0.15_80)]" />
            <span className="flex-1">牌局已暂停</span>
            <button onClick={() => invoke('table.resume').catch(toastError)} className="rounded-full bg-white px-2.5 py-[3px] whitespace-nowrap text-foreground">继续</button>
          </div>
        )}
        {alert && (
          <div className={cn('flex flex-col gap-1.5 rounded-xl px-3.5 py-3', alert.level === 'pause' ? 'bg-[oklch(0.96_0.03_80)]' : 'bg-[oklch(0.97_0.015_255)]')}>
            <div className={cn('text-xs font-semibold', alert.level === 'pause' ? 'text-[oklch(0.5_0.12_70)]' : 'text-[oklch(0.5_0.15_255)]')}>
              {alert.level === 'pause' ? '教练暂停了牌局' : '教练提醒'}
            </div>
            <div className="text-sm leading-[1.6] [text-wrap:pretty]">{alert.message}</div>
          </div>
        )}
        {v.nums && !st.hard && <ProbPanel nums={v.nums} />}
        {v.nums && st.hard && (
          <div className="rounded-[10px] border border-dashed border-input px-3 py-2.5 text-[13px] text-muted-foreground">硬核模式：概率信息已隐藏。</div>
        )}
        {coach.map((c, i) => <Bubble key={`${c.requestId}-${c.role}-${i}`} c={c} />)}
        {loading && <div className="self-start rounded-xl bg-[#f3f3f1] px-3 py-2 text-[13px] text-muted-foreground">教练正在看牌…</div>}
        {!ready ? (
          <div className="flex flex-col items-start gap-2.5 rounded-xl border border-dashed border-input px-3.5 py-3 text-[13px] leading-[1.6] text-muted-foreground">
            教练模型未配置，配置模型后可用。概率面板照常显示。
            <button onClick={() => go('settings')} className="rounded-full border border-input bg-white px-3 py-1 text-[13px] text-foreground hover:bg-accent">去配置</button>
          </div>
        ) : (
          !alert && !coach.length && !loading && (
            <div className="text-[13px] leading-[1.6] text-muted-foreground">
              轮到你时，教练会自己判断：保持沉默、提醒你，还是暂停牌局。你也可以随时提问，提问时牌局会暂停。
            </div>
          )
        )}
      </div>
      <div className="flex flex-col gap-2.5 border-t px-4 pt-3 pb-4">
        {ready && (
          <>
            <div className="flex flex-wrap gap-1.5">
              {QUICK[st.level].map((q) => (
                <button key={q} onClick={() => ask(q)} className="rounded-full border px-2.5 py-1 text-xs text-label hover:bg-accent">{q}</button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && ask(input)}
                placeholder="问问教练…"
                className="min-w-0 flex-1 rounded-[10px] border border-input px-3 py-[9px] text-sm outline-none"
              />
              <button onClick={() => ask(input)} className="rounded-[10px] bg-foreground px-3 py-[9px] text-sm whitespace-nowrap text-white">暂停并提问</button>
            </div>
          </>
        )}
        <div className="flex items-center gap-2 text-[13px] text-label">
          <span className="flex-1">硬核模式 · 隐藏概率</span>
          <Switch checked={st.hard} onCheckedChange={(hard) => set({ hard })} />
        </div>
      </div>
    </aside>
  )
}
