import { useEffect, useRef, useState } from 'react'
import { signed } from '@/lib/format'
import { invoke, toastError, useEvent } from '@/lib/river'
import { cn } from '@/lib/utils'
import type { HandRecord } from '../../../shared/types'

// ponytail: vpip/pfr 只在完整记录里，按手逐条 hands.get；上千手变慢时再加主进程聚合命令
async function loadAll() {
  const list = await invoke('hands.list')
  const got = await Promise.all(list.map((h) => invoke('hands.get', h.id)))
  return got.flatMap((r) => (r ? [r.record] : [])).reverse()
}

export function Stats() {
  const [H, setH] = useState<HandRecord[] | null>(null)
  const [failed, setFailed] = useState(false)
  // 手数多时加载慢，连续 hands:changed 的早一次可能晚返回，只认最后一次
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
      </div>
    </div>
  )
}
