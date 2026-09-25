import { dict, type Locale } from '@river/i18n'
import { feltOf, TableStage } from '@river/ui'
import { useEffect, useMemo, useRef, useState } from 'react'
import { site } from '../i18n/site'
import { curOf, money, useSite } from '../lib/store'
import { createSim, run, type Sim } from '../sim/sim'
import { toSeatView, type DemoView } from '../sim/to-seat-view'

const IDS = ['bai', 'li', 'k', 'prof', 'may']
const EMPTY: DemoView = { seats: [], board: [], pot: 0, done: true, handNo: 0, actor: '' }
const ICON = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/river-icon.png`

export default function DemoTable({ lang }: { lang: Locale }) {
  const S = site[lang].demo
  const P = dict(lang).poker
  const { felt, feltCustom, back, fx, cur } = useSite()
  const wrapRef = useRef<HTMLDivElement>(null)
  const ctl = useRef<ReturnType<typeof run>>(null)
  const [sim, setSim] = useState<Sim | null>(null)
  const [tick, setTick] = useState(0)
  const [paused, setPaused] = useState(false)
  const [w, setW] = useState(1000)

  // 牌局在客户端开始：服务端与首次渲染都是空桌，避免随机牌面导致水合不一致
  useEffect(() => {
    const s = createSim(IDS)
    setSim(s)
    ctl.current = run(s, () => setTick((k) => k + 1))
    return () => ctl.current?.stop()
  }, [])

  useEffect(() => {
    const el = wrapRef.current!
    const measure = () => setW(el.clientWidth)
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    return () => ro.disconnect()
  }, [])

  const v = useMemo(() => (sim ? toSeatView(sim, lang) : EMPTY), [sim, tick, lang])
  const narrow = w < 720
  const DW = narrow ? 640 : 1000
  const DH = narrow ? 640 : 560
  const sc = Math.min(1.1, w / DW)
  const togglePause = () => {
    setPaused(!paused)
    ctl.current?.setPaused(!paused)
  }

  return (
    <div className="mx-auto mt-14 max-w-[1080px] overflow-hidden rounded-[14px] border border-input bg-white shadow-[0_40px_90px_-20px_rgba(0,0,0,0.18),0_8px_24px_rgba(0,0,0,0.05)]">
      <div className="flex h-[52px] items-center gap-3 border-b bg-topbar px-4">
        <div className="flex gap-2">
          <div className="size-3 rounded-full bg-[#ff5f57]" />
          <div className="size-3 rounded-full bg-[#febc2e]" />
          <div className="size-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="ml-2.5 flex items-center gap-1.5 text-[16px] font-semibold">
          <img src={ICON} alt="" width={24} height={24} className="block" />
          <span className="max-[480px]:hidden">River</span>
        </div>
        <div className="ml-1.5 hidden gap-0.5 min-[820px]:flex">
          {S.appNav.map((l, i) => (
            <div key={l} className={`rounded-lg px-3 py-1.5 text-[14px] whitespace-nowrap ${i === 1 ? 'bg-[#e9e9e6] font-semibold text-foreground' : 'text-label'}`}>
              {l}
            </div>
          ))}
        </div>
        <div className="flex-1" />
        <div className="text-[14px] whitespace-nowrap text-muted-foreground">{S.hand(Math.max(1, v.handNo))}</div>
        <div className="flex items-center gap-1.5 rounded-full border bg-white px-2.5 py-[5px] text-[13px] whitespace-nowrap">
          <span className="size-1.5 rounded-full bg-[oklch(0.7_0.14_70)]" />
          <span className="text-muted-foreground">{S.table}</span>
          <span className="font-semibold">{money(0.0033 * Math.max(0, v.handNo - 1) + 0.0011, curOf(cur, lang))}</span>
        </div>
      </div>
      <div ref={wrapRef} className="relative min-h-[280px] w-full overflow-hidden bg-[#f4f4f1]" style={{ height: Math.round(DH * sc) }}>
        {/* 缩放加在外层：全下震屏会改写 TableStage 根节点的 transform */}
        <div className="absolute top-0 left-0 flex origin-top-left flex-col leading-[1.5]" style={{ width: DW, height: DH, transform: `scale(${sc})` }}>
          <TableStage
            seats={v.seats}
            board={v.board}
            pot={v.pot}
            done={v.done}
            handNo={v.handNo}
            heroSeat={null}
            heroTurn={false}
            felt={feltOf({ felt, feltCustom })}
            back={back}
            fx={fx}
            labels={{ pot: P.pot, sb: P.pos.sb, bb: P.pos.bb }}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t bg-background px-5 py-3.5">
        <span className="min-w-[240px] flex-1 text-[13px] text-pretty text-muted-foreground">{S.note}</span>
        <span className="text-[13px] whitespace-nowrap text-blue">{sim && !paused ? S.status(v.actor, v.done) : ''}</span>
        <button type="button" onClick={togglePause} className="cursor-pointer rounded-full border border-input bg-white px-[13px] py-[5px] text-[13px] whitespace-nowrap hover:bg-accent">
          {paused ? S.resume : S.pause}
        </button>
      </div>
    </div>
  )
}
