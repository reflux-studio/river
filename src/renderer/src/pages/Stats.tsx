import { useEffect, useRef, useState } from 'react'
import { Confirm } from '@/components/Confirm'
import { costText, signed, tokens, usd } from '@/lib/format'
import { invoke, toastError, useEvent } from '@/lib/river'
import { cn } from '@/lib/utils'
import type { HandSummary, Purpose, UsageSummary } from '../../../shared/types'

const PURPOSE: Record<Purpose, [string, string]> = {
  decide: ['AI 决策', 'oklch(0.6 0.17 255)'],
  speak: ['教练讲解', 'oklch(0.62 0.13 155)'],
  ask: ['教练问答', 'oklch(0.72 0.14 80)'],
  recap: ['每手复盘', 'oklch(0.58 0.16 300)']
}

function Usage() {
  const [u, setU] = useState<UsageSummary | null>(null)
  const load = () => void invoke('usage.summary').then(setU, toastError)
  useEffect(load, [])
  useEvent('usage:changed', load)
  if (!u) return null
  const t = u.total
  const priced = t.tokens > t.unpriced
  // 有价格时按花费分占比，全无价格时按 token
  const share = (x: { usd: number; tokens: number }) => (priced ? (t.usd ? x.usd / t.usd : 0) : t.tokens ? x.tokens / t.tokens : 0)
  const kpis = [
    { l: '估算花费', v: priced ? usd(t.usd) : '—', h: t.unpriced ? `另有 ${tokens(t.unpriced)} token 无价格` : '按 models.dev 价格估算' },
    { l: '调用次数', v: String(t.calls), h: t.unknown ? `其中 ${t.unknown} 次用量未知（超时或中止）` : '对手与教练合计' },
    { l: 'Token 输入 / 输出', v: `${tokens(t.input)} / ${tokens(t.output)}`, h: '提供方返回的用量' },
    {
      l: '平均每手',
      v: !u.hands.length ? '—' : priced ? usd(u.avgPerHand ?? 0) : tokens(u.hands.reduce((a, h) => a + h.tokens, 0) / u.hands.length) + ' token',
      h: u.hands.length ? `基于 ${u.hands.length} 手` : '打完一手后统计'
    }
  ]
  const mc = Math.max(1e-9, ...u.hands.map((h) => (priced ? h.usd : h.tokens)))
  return (
    <div className="flex flex-col gap-[18px] rounded-[14px] border bg-white p-5">
      <div className="flex items-baseline gap-2.5">
        <span className="text-[15px] font-semibold">LLM 用量与花费</span>
        <span className="text-xs text-muted-foreground">{u.since ? `自 ${new Date(u.since).toLocaleDateString('zh-CN')} 起` : '全部记录'}</span>
        <div className="flex-1" />
        <Confirm title="清零用量统计？" description="只清除用量与花费记录，不影响手牌历史。" action="清零" onConfirm={() => void invoke('usage.reset').catch(toastError)}>
          <button className="text-xs text-muted-foreground">清零</button>
        </Confirm>
      </div>
      <div className="grid grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div key={k.l} className="flex flex-col gap-[3px]">
            <span className="text-xs text-muted-foreground">{k.l}</span>
            <span className="text-2xl font-semibold tracking-[-0.01em]">{k.v}</span>
            <span className="text-xs text-[#a1a1a6]">{k.h}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-0.5">
        <div className="grid grid-cols-[110px_minmax(0,1fr)_60px_90px_110px] gap-3 pb-1.5 text-xs text-[#a1a1a6]">
          <span>用途</span><span>{priced ? '花费占比' : 'Token 占比'}</span><span className="text-right">调用</span><span className="text-right">Token</span><span className="text-right">花费</span>
        </div>
        {u.purposes.map((c) => (
          <div key={c.purpose} className="grid grid-cols-[110px_minmax(0,1fr)_60px_90px_110px] items-center gap-3 border-t border-divider py-2 text-[13px]">
            <span className="flex items-center gap-[7px]"><span className="size-2 rounded-[2px]" style={{ background: PURPOSE[c.purpose][1] }} />{PURPOSE[c.purpose][0]}</span>
            <div className="relative h-1.5 rounded-full bg-[#f0f0ee]"><div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${share(c) * 100}%`, background: PURPOSE[c.purpose][1] }} /></div>
            <span className="text-right text-label">{c.calls}</span>
            <span className="text-right text-label">{tokens(c.tokens)}</span>
            <span className="text-right font-semibold">{c.tokens || c.calls ? costText(c) : '—'}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-[13px] text-label">每手{priced ? '花费' : ' token'} · 最近 40 手</span>
        <div className="flex h-[70px] items-end gap-[3px] border-b">
          {u.hands.map((h, i) => (
            <div key={i} title={`第 ${h.handNo} 手 · ${priced ? usd(h.usd) : tokens(h.tokens) + ' token'}`} className="max-w-[22px] flex-1 rounded-t-[3px] bg-[oklch(0.75_0.13_70)]" style={{ height: Math.max(1, ((priced ? h.usd : h.tokens) / mc) * 66) }} />
          ))}
        </div>
      </div>
      <div className="text-xs leading-[1.6] text-pretty text-muted-foreground">
        Token 来自提供方返回的用量；价格来自 models.dev，仅供参考，实际以账单为准。没有公开价格的模型（例如 OpenAI 兼容接口）只统计 token。
      </div>
    </div>
  )
}

const loadAll = async () => (await invoke('hands.list')).reverse()

export function Stats() {
  const [H, setH] = useState<HandSummary[] | null>(null)
  const [failed, setFailed] = useState(false)
  // 连续 hands:changed 的早一次可能晚返回，只认最后一次
  const seq = useRef(0)
  const load = () => {
    const n = ++seq.current
    loadAll().then(
      (h) => n === seq.current && (setH(h), setFailed(false)),
      (e) => n === seq.current && (setFailed(true), toastError(e))
    )
  }
  useEffect(load, [])
  useEvent('hands:changed', load)
  if (!H)
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        {failed && (
          <button className="text-blue" onClick={load}>
            加载失败，重试
          </button>
        )}
      </div>
    )

  const n = H.length
  const pct = (x: number) => (n ? Math.round((x / n) * 100) + '%' : '—')
  const net = H.reduce((a, r) => a + r.net, 0)
  const sd = H.filter((r) => r.showdown)
  const kpis = [
    { l: '已打手数', v: String(n), h: '全部手牌' },
    { l: '净盈亏', v: n ? signed(net) : '—', h: '筹码', tone: net > 0 ? 'text-win' : net < 0 ? 'text-lose' : '' },
    { l: '赢下的手牌', v: pct(H.filter((r) => r.net > 0).length), h: '赢得底池的比例' },
    { l: 'VPIP 入池率', v: pct(H.filter((r) => r.vpip).length), h: '翻牌前主动投入筹码的比例，常见 20–30%' },
    { l: 'PFR 翻前加注', v: pct(H.filter((r) => r.pfr).length), h: '翻牌前加注的比例，越接近 VPIP 越凶' },
    {
      l: '摊牌胜率',
      v: sd.length ? Math.round((sd.filter((r) => r.net > 0).length / sd.length) * 100) + '%' : '—',
      h: `共摊牌 ${sd.length} 次`
    }
  ]
  const last = H.slice(-40)
  const mx = Math.max(1, ...last.map((r) => Math.abs(r.net)))

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto flex max-w-[1000px] flex-col gap-5 px-8 pt-10 pb-16">
        <div className="flex flex-col gap-1.5">
          <div className="text-[28px] font-semibold">数据统计</div>
          <div className="text-[15px] text-subtle">基于全部 {n} 手记录。</div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {kpis.map((k) => (
            <div key={k.l} className="flex flex-col gap-1 rounded-[14px] border bg-white px-[18px] py-4">
              <span className="text-[13px] text-muted-foreground">{k.l}</span>
              <span className={cn('text-[28px] font-semibold tracking-[-0.01em]', k.tone)}>{k.v}</span>
              <span className="text-xs text-[#a1a1a6]">{k.h}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-3 rounded-[14px] border bg-white p-[18px]">
          <span className="text-[15px] font-semibold">每手盈亏</span>
          <div className="relative flex h-40 items-stretch gap-[3px]">
            <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
            {last.map((r, i) => {
              const h = Math.max(2, (Math.abs(r.net) / mx) * 76)
              return (
                <div key={i} className="relative max-w-[22px] flex-1">
                  <div
                    className={cn('absolute inset-x-0 rounded-[3px]', r.net >= 0 ? 'bg-win' : 'bg-lose')}
                    style={{ height: h, top: r.net >= 0 ? `calc(50% - ${h}px)` : '50%' }}
                  />
                </div>
              )
            })}
          </div>
        </div>
        <Usage />
      </div>
    </div>
  )
}
