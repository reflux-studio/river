import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AppearancePopover } from '@/components/Appearance'
import { EmptyCard, PlayingCard } from '@/components/PlayingCard'
import { ActionBar } from '@/components/table/ActionBar'
import { ChatPanel, lastSaid, useSpeaker } from '@/components/table/ChatPanel'
import { CoachPanel } from '@/components/table/CoachPanel'
import { BetChip, ChipStacks, Seat } from '@/components/table/Seat'
import { useTableFx } from '@/components/table/useTableFx'
import { feltOf } from '@/lib/felt'
import { fmt } from '@/lib/format'
import { useRiver } from '@/lib/river'
import type { TableView } from '../../../shared/types'

const CHAT_KEY = 'river.chatShown'
const readChatShown = () => {
  try {
    const v = localStorage.getItem(CHAT_KEY)
    return v === null ? null : v === 'true'
  } catch {
    return null
  }
}

const onResize = (f: () => void) => (window.addEventListener('resize', f), () => window.removeEventListener('resize', f))
const useWidth = () => useSyncExternalStore(onResize, () => window.innerWidth)

const floating = 'flex items-center gap-2 rounded-full border border-input bg-white px-3 py-1.5 text-[13px] whitespace-nowrap shadow-[0_4px_14px_rgba(0,0,0,0.05)]'

export function Table() {
  const view = useRiver((s) => s.view)
  if (!view) return <div className="flex-1" />
  return <Screen v={view} />
}

function Screen({ v }: { v: TableView }) {
  const chat = useRiver((s) => s.chat)
  const st = useRiver((s) => s.settings)
  const who = useSpeaker()
  const width = useWidth()
  const [saved, setSaved] = useState(readChatShown)
  const [feltOpen, setFeltOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const fxRef = useRef<HTMLDivElement>(null)
  // 用户没选过时按窗口宽度决定，窄窗口默认收起
  const showChat = saved ?? width >= 1280
  const toggleChat = () => {
    setSaved(!showChat)
    try {
      localStorage.setItem(CHAT_KEY, String(!showChat))
    } catch {
      // 存不下只影响下次打开时的默认值
    }
  }
  const F = feltOf(st)
  useEffect(() => {
    if (!feltOpen) return
    const close = (e: MouseEvent) => !(e.target as Element).closest('[data-felt-popover]') && setFeltOpen(false)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [feltOpen])
  useTableFx(rootRef, fxRef, v, st.fx, st.back)
  const n = v.seats.length
  const last = lastSaid(chat)
  const potInk = F.dark ? '#fff' : '#1d1d1f'
  return (
    <div className="flex min-h-0 flex-1">
      {showChat && <ChatPanel onCollapse={toggleChat} />}
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div ref={rootRef} className="relative min-h-[560px] flex-1 overflow-hidden" style={{ background: F.dark ? '#f4f4f1' : '#fff' }}>
          {!showChat && (
            <button onClick={toggleChat} className={`${floating} absolute top-3.5 left-3.5 z-[9]`}>
              公屏
              {last && <span className="max-w-[180px] truncate text-muted-foreground">{who(last.from).name}：{last.text}</span>}
            </button>
          )}
          <div data-felt-popover className="absolute top-3.5 right-3.5 z-10 flex flex-col items-end gap-2">
            <button onClick={() => setFeltOpen((x) => !x)} className={floating}>
              <span className="size-3 rounded-full shadow-[0_0_0_1px_rgba(0,0,0,0.15)]" style={{ background: F.felt }} />
              桌面外观
            </button>
            {feltOpen && <AppearancePopover />}
          </div>

          <div
            className="absolute inset-x-[13%] top-[15%] bottom-[16%] rounded-full"
            style={{
              background: `radial-gradient(ellipse 70% 65% at 50% 42%, color-mix(in oklch, ${F.felt}, white 14%) 0%, ${F.felt} 58%, color-mix(in oklch, ${F.felt}, black 28%) 100%)`,
              boxShadow: `0 0 0 12px ${F.rail}, 0 0 0 13px rgba(0,0,0,0.3), 0 22px 50px rgba(0,0,0,0.22), inset 0 0 50px rgba(0,0,0,${F.dark ? 0.35 : 0.08})`
            }}
          />
          <div
            className="pointer-events-none absolute inset-x-[calc(13%+18px)] top-[calc(15%+18px)] bottom-[calc(16%+18px)] rounded-full border"
            style={{ borderColor: F.dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.07)' }}
          />

          <div className="absolute top-[48%] left-1/2 z-[1] flex -translate-1/2 flex-col items-center gap-3">
            <div data-pot className="flex min-h-[30px] items-center gap-2">
              {v.pot > 0 && !v.done && <ChipStacks amount={v.pot} />}
              <div className="flex items-baseline gap-2 rounded-full px-3.5 py-[5px] text-sm whitespace-nowrap" style={{ background: F.dark ? 'rgba(0,0,0,0.38)' : '#fff', color: potInk }}>
                <span className="opacity-75">底池</span>
                <span className="font-semibold">{fmt(v.pot)}</span>
              </div>
            </div>
            <div data-boardrow className="flex gap-[7px] [perspective:600px]">
              {[0, 1, 2, 3, 4].map((k) =>
                v.board[k] ? <div key={v.board[k]} data-board-card><PlayingCard card={v.board[k]} /></div> : <EmptyCard key={k} border={F.dark ? 'rgba(255,255,255,0.22)' : '#d6d6d2'} />
              )}
            </div>
          </div>

          {v.seats.map((s, i) => s.bet > 0 && <BetChip key={i} amount={s.bet} i={i} n={n} dark={F.dark} />)}
          {v.seats.map((s, i) => <Seat key={i} seat={s} i={i} n={n} heroTurn={v.hero.isTurn} />)}
          <div ref={fxRef} className="pointer-events-none absolute inset-0 z-[8]" />
        </div>
        <ActionBar view={v} />
      </main>
      <CoachPanel view={v} />
    </div>
  )
}
