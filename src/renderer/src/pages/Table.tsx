import { useState, useSyncExternalStore } from 'react'
import { EmptyCard, PlayingCard } from '@/components/PlayingCard'
import { ActionBar } from '@/components/table/ActionBar'
import { ChatPanel, lastSaid, useSpeaker } from '@/components/table/ChatPanel'
import { CoachPanel } from '@/components/table/CoachPanel'
import { BetChip, Seat } from '@/components/table/Seat'
import { fmt } from '@/lib/format'
import { invoke, toastError, useRiver } from '@/lib/river'

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

function Banner({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div className="flex shrink-0 items-center justify-center gap-2.5 border-b bg-[oklch(0.97_0.02_25)] px-4 py-2 text-[13px]">
      <span className="size-1.5 rounded-full bg-lose" />
      {text}
      <button onClick={onRetry} className="rounded-full bg-foreground px-3 py-0.5 text-white">重试</button>
    </div>
  )
}

export function Table() {
  const view = useRiver((s) => s.view)
  const chat = useRiver((s) => s.chat)
  const who = useSpeaker()
  const width = useWidth()
  const [saved, setSaved] = useState(readChatShown)
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
  // bootstrap 之后主进程才补发 table:view
  if (!view) return <div className="flex-1" />

  const n = view.seats.length
  const last = lastSaid(chat)
  const retry = () => invoke('table.retryModels').catch(toastError)

  return (
    <div className="flex min-h-0 flex-1">
      {showChat && <ChatPanel onCollapse={toggleChat} />}
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        {view.breaker.opponent && <Banner text="对手模型连续失败，已托管" onRetry={retry} />}
        {view.breaker.coach && <Banner text="教练模型连续失败，已停用" onRetry={retry} />}
        <div className="relative min-h-[540px] flex-1">
          {!showChat && (
            <button
              onClick={toggleChat}
              className="absolute top-3.5 left-3.5 z-[6] flex items-center gap-2 rounded-full border border-input bg-white px-3 py-1.5 text-[13px] whitespace-nowrap shadow-[0_4px_14px_rgba(0,0,0,0.05)]"
            >
              公屏
              {last && <span className="max-w-[180px] truncate text-muted-foreground">{who(last.from).name}：{last.text}</span>}
            </button>
          )}
          <div className="absolute inset-x-[14%] top-[16%] bottom-[17%] rounded-full bg-accent" />
          <div className="absolute top-[48%] left-1/2 flex -translate-1/2 flex-col items-center gap-3">
            <div className="flex items-baseline gap-2 rounded-full border bg-white px-3.5 py-[5px] text-sm whitespace-nowrap">
              <span className="text-muted-foreground">底池</span>
              <span className="font-semibold">{fmt(view.pot)}</span>
            </div>
            <div className="flex gap-1.5">
              {[0, 1, 2, 3, 4].map((k) => (view.board[k] ? <PlayingCard key={k} card={view.board[k]} /> : <EmptyCard key={k} />))}
            </div>
          </div>
          {view.seats.map((s, i) => s.bet > 0 && <BetChip key={i} amount={s.bet} i={i} n={n} />)}
          {view.seats.map((s, i) => <Seat key={i} seat={s} i={i} n={n} heroTurn={view.hero.isTurn} />)}
        </div>
        <ActionBar view={view} />
      </main>
      <CoachPanel view={view} />
    </div>
  )
}
