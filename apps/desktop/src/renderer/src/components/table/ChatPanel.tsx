import { Avatar, MiniCards } from '@river/ui'
import { useEffect, useRef } from 'react'
import { useRiver, useT } from '@/lib/river'
import type { ChatMessage } from '../../../../shared/types'

export function useSpeaker() {
  const personas = useRiver((s) => s.personas)
  const seats = useRiver((s) => s.view?.seats)
  const t = useT()
  // 先按本桌入座快照解析：牌局中删除的对手照常显示
  return (from?: string) => {
    if (!from || from === 'hero') return { name: t.desktop.table.you, ini: t.desktop.table.youIni, hue: undefined as number | undefined }
    const p = seats?.find((x) => x.personaId === from) ?? personas.find((x) => x.id === from)
    return p ? { name: p.name, ini: p.ini, hue: p.hue as number | undefined } : { name: t.desktop.model.unknown, ini: t.desktop.model.unknown, hue: undefined }
  }
}

export const lastSaid = (chat: ChatMessage[]) => [...chat].reverse().find((m): m is ChatMessage & { text: string } => m.kind === 'msg' && !!m.text)

// 公屏只读：对手只在自己回合随行动说一句，玩家不发言（U1）
export function ChatPanel({ onCollapse }: { onCollapse: () => void }) {
  const chat = useRiver((s) => s.chat)
  const who = useSpeaker()
  const c = useT().desktop.chat
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [chat.length])

  return (
    <aside className="flex min-h-0 w-[248px] shrink-0 flex-col border-r min-[1100px]:w-72">
      <div className="flex items-center gap-2 border-b border-[#f0f0ee] px-4 py-3">
        <span className="text-[15px] font-semibold">{c.title}</span>
        <button onClick={onCollapse} className="text-xs whitespace-nowrap text-muted-foreground">{c.collapse}</button>
      </div>
      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-4 py-3.5">
        {chat.map((m) => {
          if (m.kind === 'sys')
            return (
              <div key={m.id} className="flex items-center justify-center gap-1.5 text-xs text-[#a1a1a6]">
                <span>— {m.text}</span>
                {m.cards?.length ? <MiniCards cards={m.cards} /> : null}
                <span>—</span>
              </div>
            )
          const s = who(m.from)
          if (m.kind === 'act')
            return (
              <div key={m.id} className="flex items-center gap-1.5 pl-[38px] text-xs text-muted-foreground">
                <span className="font-semibold text-label">{s.name}</span>
                <span>{m.act}</span>
              </div>
            )
          return (
            <div key={m.id} className="flex gap-2.5">
              <Avatar ini={s.ini} hue={s.hue} size={28} />
              <div className="flex min-w-0 flex-col gap-[3px]">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-semibold">{s.name}</span>
                  {m.act && <span className="rounded-[5px] bg-muted px-1.5 py-px text-[11px] whitespace-nowrap text-subtle">{m.act}</span>}
                </div>
                <div className="text-sm leading-normal break-words [text-wrap:pretty]">{m.text}</div>
              </div>
            </div>
          )
        })}
        {!chat.length && <div className="text-[13px] text-muted-foreground">{c.empty}</div>}
      </div>
    </aside>
  )
}
