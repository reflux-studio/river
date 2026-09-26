import { dict, presets, type Locale } from '@river/i18n'
import { BACKS, backPattern, EmptyCard, feltOf, FELTS, PlayingCard, playAllIn, RAINBOW, Seat } from '@river/ui'
import type { Fx } from '@river/ui/types'
import { useEffect, useRef } from 'react'
import { site } from '../i18n/site'
import { setSite, useSite } from '../lib/store'
import { Seg } from './Seg'

const ON = '0 0 0 2px #121214, 0 0 0 4px #f5f5f3'
const OFF = '0 0 0 1px rgba(255,255,255,0.25)'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3.5">
      <span className="w-11 text-[13px] text-[#a1a1a6]">{label}</span>
      {children}
    </div>
  )
}

// 外观切换（演示桌同步生效）与全下展示：小牌桌每 2.8 秒播一次 ui 的 playAllIn
export default function Effects({ lang }: { lang: Locale }) {
  const E = site[lang].effects
  const D = dict(lang)
  const cow = presets[lang].find((p) => p.id === 'cow')!
  const st = useSite()
  const F = feltOf(st)
  const rootRef = useRef<HTMLDivElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (st.fx !== 'full') return
    const id = setInterval(() => {
      const R = rootRef.current!
      const r = R.getBoundingClientRect()
      if (r.bottom > 0 && r.top < window.innerHeight) playAllIn(R, layerRef.current!, R.querySelector('[data-seat]'))
    }, 2800)
    return () => clearInterval(id)
  }, [st.fx])

  return (
    <div className="mx-auto grid max-w-[1120px] grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-stretch overflow-hidden rounded-[28px] bg-[#121214] text-[#f5f5f3]">
      <div className="flex flex-col justify-center gap-[18px] p-[clamp(32px,5vw,64px)]">
        <div className="text-[14px] font-semibold text-[oklch(0.74_0.17_27)]">{E.eyebrow}</div>
        <h3 className="m-0 text-[clamp(30px,3.8vw,46px)] leading-[1.12] font-bold tracking-[-0.03em] text-balance">
          {E.title[0]}
          <br />
          {E.title[1]}
        </h3>
        <p className="m-0 max-w-[440px] text-[17px] leading-[1.65] text-pretty text-[#c7c7c2]">{E.lead}</p>
        <div className="flex flex-col gap-3.5 pt-2">
          <Row label={E.fx}>
            <Seg
              opts={E.fxOpts as [Fx, string][]}
              value={st.fx}
              onChange={(fx) => setSite({ fx })}
              className="rounded-[9px] bg-white/10 p-[3px]"
              item="px-3.5 py-[5px] text-[13px]"
              on="bg-accent font-semibold text-foreground"
              off="bg-transparent text-[#f5f5f3]"
            />
          </Row>
          <Row label={E.felt}>
            <div className="flex flex-wrap gap-2">
              {FELTS.map((f) => (
                <button
                  key={f.k}
                  type="button"
                  title={D.common.felt[f.k]}
                  aria-label={D.common.felt[f.k]}
                  aria-pressed={st.felt === f.k}
                  onClick={() => setSite({ felt: f.k })}
                  className="size-6 cursor-pointer rounded-full border-0"
                  style={{ background: f.felt, boxShadow: st.felt === f.k ? ON : OFF }}
                />
              ))}
              <label
                title={E.custom}
                className="relative block size-6 cursor-pointer rounded-full"
                style={{ background: st.felt === 'custom' ? st.feltCustom : RAINBOW, boxShadow: st.felt === 'custom' ? ON : OFF }}
              >
                <input
                  type="color"
                  aria-label={E.custom}
                  value={st.feltCustom}
                  onChange={(e) => setSite({ felt: 'custom', feltCustom: e.target.value })}
                  className="absolute inset-0 size-full cursor-pointer border-0 p-0 opacity-0"
                />
              </label>
            </div>
          </Row>
          <Row label={E.back}>
            <div className="flex gap-2">
              {BACKS.map((b, i) => (
                <button
                  key={b.k}
                  type="button"
                  aria-label={E.backN(i + 1)}
                  aria-pressed={st.back === b.k}
                  onClick={() => setSite({ back: b.k })}
                  className="box-border h-7 w-5 cursor-pointer rounded-[4px] border-0 bg-white p-0.5"
                  style={{ boxShadow: st.back === b.k ? ON : OFF }}
                >
                  <div className="size-full rounded-[2px]" style={{ background: backPattern(b.c) }} />
                </button>
              ))}
            </div>
          </Row>
        </div>
      </div>
      <div ref={rootRef} className="relative min-h-[400px] overflow-hidden bg-[#f4f4f1] leading-[1.5] text-foreground">
        <div
          className="absolute inset-x-[12%] top-[18%] bottom-[26%] rounded-full"
          style={{
            background: `radial-gradient(ellipse 70% 65% at 50% 42%, color-mix(in oklch, ${F.felt}, white 14%) 0%, ${F.felt} 58%, color-mix(in oklch, ${F.felt}, black 28%) 100%)`,
            boxShadow: `0 0 0 12px ${F.rail}, 0 0 0 13px rgba(0,0,0,0.3), 0 22px 50px rgba(0,0,0,0.22), inset 0 0 50px rgba(0,0,0,${F.dark ? 0.35 : 0.08})`
          }}
        />
        <div className="absolute top-[44%] left-1/2 flex -translate-1/2 gap-[5px]">
          {['Ks', 'Kh', '7d'].map((c) => <PlayingCard key={c} card={c} w={40} h={57} />)}
          <EmptyCard w={40} h={57} border={F.dark ? 'rgba(255,255,255,0.22)' : '#d6d6d2'} />
          <EmptyCard w={40} h={57} border={F.dark ? 'rgba(255,255,255,0.22)' : '#d6d6d2'} />
        </div>
        {/* Seat 以自身中心定位在这个零尺寸点上（i=1、n=2 时极坐标偏移为 0） */}
        <div className="absolute top-[18%] left-1/2 size-0">
          <Seat
            seat={{ name: cow.name, tag: cow.tag, ini: cow.ini, hue: cow.hue, stack: 0, bet: 0, isDealer: false, isSB: false, isBB: false, folded: false, out: false, allin: true, status: E.allin, statusTone: 'red', thinking: false, winner: false, hasCards: false }}
            i={1}
            n={2}
            isHero={false}
            heroTurn={false}
            back={st.back}
            labels={{ sb: D.poker.pos.sb, bb: D.poker.pos.bb }}
          />
        </div>
        <div className="absolute inset-x-4 bottom-4 flex gap-2">
          <div className="flex flex-1 items-center justify-center rounded-[10px] border border-input bg-white py-[11px] text-[15px] whitespace-nowrap">{E.fold}</div>
          <div className="flex flex-[1.4] items-center justify-center rounded-[10px] bg-[linear-gradient(180deg,oklch(0.62_0.21_28),oklch(0.52_0.2_25))] py-[11px] text-[15px] font-medium whitespace-nowrap text-white">
            {E.allin}
          </div>
        </div>
        <div ref={layerRef} className="pointer-events-none absolute inset-0 z-[8]" />
      </div>
    </div>
  )
}
