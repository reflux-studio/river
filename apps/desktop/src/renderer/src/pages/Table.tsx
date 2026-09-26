import { feltOf, TableStage } from '@river/ui'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { AppearancePopover } from '@/components/Appearance'
import { ActionBar } from '@/components/table/ActionBar'
import { ChatPanel, lastSaid, useSpeaker } from '@/components/table/ChatPanel'
import { CoachPanel } from '@/components/table/CoachPanel'
import { useRiver, useT } from '@/lib/river'
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
  const t = useT()
  const width = useWidth()
  const [saved, setSaved] = useState(readChatShown)
  const [feltOpen, setFeltOpen] = useState(false)
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
  const last = lastSaid(chat)
  return (
    <div className="flex min-h-0 flex-1">
      {showChat && <ChatPanel onCollapse={toggleChat} />}
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <TableStage
          seats={v.seats}
          board={v.board}
          pot={v.pot}
          done={v.done}
          handNo={v.handNo}
          heroSeat={0}
          heroTurn={v.hero.isTurn}
          felt={F}
          back={st.back}
          fx={st.fx}
          labels={{ pot: t.poker.pot, sb: t.poker.pos.sb, bb: t.poker.pos.bb }}
        >
          {!showChat && (
            <button onClick={toggleChat} className={`${floating} absolute top-3.5 left-3.5 z-[9]`}>
              {t.desktop.chat.title}
              {last && <span className="max-w-[180px] truncate text-muted-foreground">{t.desktop.chat.last(who(last.from).name, last.text)}</span>}
            </button>
          )}
          <div data-felt-popover className="absolute top-3.5 right-3.5 z-10 flex flex-col items-end gap-2">
            <button onClick={() => setFeltOpen((x) => !x)} className={floating}>
              <span className="size-3 rounded-full shadow-[0_0_0_1px_rgba(0,0,0,0.15)]" style={{ background: F.felt }} />
              {t.desktop.appearance.title}
            </button>
            {feltOpen && <AppearancePopover />}
          </div>
        </TableStage>
        <ActionBar view={v} />
      </main>
      <CoachPanel view={v} />
    </div>
  )
}
